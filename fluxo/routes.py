"""Rotas do Fluxo. Tudo em /fluxo/ (páginas) e /api/fluxo/ (API). Não altera nenhuma rota existente."""
import os
import threading
import uuid
from datetime import datetime, timezone
from functools import wraps

import pyodbc
from flask import Blueprint, Response, current_app, jsonify, redirect, request, send_from_directory

from .schema import ESPACOS, ensure_schema

STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

# Quem pode o quê (o perfil 'master' sempre passa — regra do exige_permissao existente).
OPERADOR = ["operacional", "admin"]            # registra serviços pelo QR Code
GESTAO = ["admin", "visitante"]                # painel, relatórios, fotos de qualquer serviço
QUALQUER = ["operacional", "admin", "visitante"]

ETAPAS = {"tipo", "det", "and", "fin", "rev", "fim"}
TIPOS = {"montagem", "desmontagem", "troca"}
FOTO_TIPOS = {"inicial", "andamento", "final"}
CAMPOS = {"etapa": "etapa", "tipo": "tipo", "antes": "layout_antes", "depois": "layout_depois",
          "evento": "evento", "chapas": "chapas", "descFim": "desc_final"}
LIMITES = {"antes": 120, "depois": 120, "evento": 200, "chapas": 300, "descFim": 300}
MAX_FOTO = 6 * 1024 * 1024

COLS = ("o.id, e.slug, e.nome, o.status, o.etapa, o.tipo, o.layout_antes, o.layout_depois, "
        "o.evento, o.chapas, o.desc_final, o.inicio_em, o.fim_em, o.criado_por")
FROM_OP = "FROM fluxo_operacoes o JOIN fluxo_espacos e ON e.id = o.espaco_id"


def agora_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def ms(dt):
    return None if dt is None else int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def agora_ms():
    return ms(agora_utc())


def op_json(r):
    return {"id": r[0], "salaSlug": r[1], "salaNome": r[2], "status": r[3], "etapa": r[4],
            "tipo": r[5] or "", "antes": r[6] or "", "depois": r[7] or "", "evento": r[8] or "",
            "chapas": r[9] or "", "descFim": r[10] or "", "inicioEm": ms(r[11]), "fimEm": ms(r[12]),
            "criadoPor": r[13] or ""}


def tipo_imagem(b):
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    return None


def criar_blueprint(get_db, exige):
    bp = Blueprint("fluxo", __name__, static_folder=STATIC, static_url_path="/fluxo/static")
    estado = {"ok": False}
    trava = threading.Lock()

    def com_banco(f):
        @wraps(f)
        def w(*a, **k):
            conn = get_db()
            if not conn:
                return jsonify(erro="Não foi possível conectar ao banco."), 503
            try:
                if not estado["ok"]:
                    with trava:
                        if not estado["ok"]:
                            if os.environ.get("FLUXO_AUTO_SCHEMA", "1") != "0":
                                ensure_schema(conn)
                            estado["ok"] = True
                return f(conn, *a, **k)
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                current_app.logger.exception("Erro no Fluxo")
                return jsonify(erro="Não deu certo. Tente de novo."), 500
        return w

    def espaco(cur, slug):
        cur.execute("SELECT id, slug, nome FROM fluxo_espacos WHERE slug = ? AND ativo = 1", (slug,))
        return cur.fetchone()

    def aberta(cur, espaco_id):
        cur.execute(f"SELECT {COLS} {FROM_OP} WHERE o.espaco_id = ? AND o.status = 'em_andamento'", (espaco_id,))
        return cur.fetchone()

    def por_id(cur, op_id):
        cur.execute(f"SELECT {COLS} {FROM_OP} WHERE o.id = ?", (op_id,))
        return cur.fetchone()

    def recentes(cur):
        cur.execute("SELECT evento, chapas FROM fluxo_operacoes ORDER BY inicio_em DESC")
        ev, ch = [], []
        for e, c in cur.fetchmany(80):
            for lista, v in ((ev, e), (ch, c)):
                v = (v or "").strip()
                if v and v not in lista and len(lista) < 5:
                    lista.append(v)
        return {"evento": ev, "chapas": ch}

    # ---------------- páginas ----------------
    @bp.route("/fluxo")
    def fluxo_sem_barra():
        qs = request.query_string.decode()
        return redirect("/fluxo/" + ("?" + qs if qs else ""), 308)

    @bp.route("/fluxo/")
    def fluxo_pagina():
        r = send_from_directory(STATIC, "index.html")
        r.headers["Cache-Control"] = "no-cache"
        return r

    # ---------------- API: espaços e operador ----------------
    @bp.get("/api/fluxo/espacos")
    @exige(QUALQUER)
    @com_banco
    def api_espacos(conn):
        cur = conn.cursor()
        try:
            cur.execute("SELECT slug, nome FROM fluxo_espacos WHERE ativo = 1 ORDER BY ordem")
            return jsonify(espacos=[{"slug": r[0], "nome": r[1]} for r in cur.fetchall()])
        finally:
            cur.close()

    @bp.get("/api/fluxo/sala/<slug>")
    @exige(OPERADOR)
    @com_banco
    def api_sala(conn, slug):
        cur = conn.cursor()
        try:
            esp = espaco(cur, slug)
            if not esp:
                return jsonify(erro="Espaço não encontrado."), 404
            r = aberta(cur, esp[0])
            return jsonify(agora=agora_ms(), sala={"slug": esp[1], "nome": esp[2]},
                           op=op_json(r) if r else None, recentes=recentes(cur))
        finally:
            cur.close()

    @bp.post("/api/fluxo/sala/<slug>/iniciar")
    @exige(OPERADOR)
    @com_banco
    def api_iniciar(conn, slug):
        cur = conn.cursor()
        try:
            esp = espaco(cur, slug)
            if not esp:
                return jsonify(erro="Espaço não encontrado."), 404
            r = aberta(cur, esp[0])
            if not r:
                ag = agora_utc()
                try:
                    cur.execute(
                        "INSERT INTO fluxo_operacoes (id, espaco_id, status, etapa, inicio_em, criado_por, atualizado_em) "
                        "VALUES (?, ?, 'em_andamento', 'tipo', ?, ?, ?)",
                        (str(uuid.uuid4()), esp[0], ag, request.environ.get("usuario_logado"), ag))
                    conn.commit()
                except pyodbc.IntegrityError:   # duas pessoas tocaram ao mesmo tempo: vale a que chegou primeiro
                    conn.rollback()
                r = aberta(cur, esp[0])
            return jsonify(agora=agora_ms(), op=op_json(r))
        finally:
            cur.close()

    @bp.patch("/api/fluxo/operacoes/<op_id>")
    @exige(OPERADOR)
    @com_banco
    def api_salvar(conn, op_id):
        d = request.get_json(silent=True) or {}
        sets, vals = [], []
        for k, col in CAMPOS.items():          # só colunas da lista acima entram no SQL
            if k not in d:
                continue
            v = ("" if d[k] is None else str(d[k])).strip()
            if k == "etapa" and v not in ETAPAS:
                return jsonify(erro="Etapa inválida."), 400
            if k == "tipo" and v and v not in TIPOS:
                return jsonify(erro="Tipo de serviço inválido."), 400
            if k in LIMITES:
                v = v[:LIMITES[k]]
            sets.append(f"{col} = ?")
            vals.append(v if k == "etapa" else (v or None))
        if not sets:
            return jsonify(ok=True)
        sets.append("atualizado_em = ?")
        vals += [agora_utc(), op_id]
        cur = conn.cursor()
        try:
            cur.execute("UPDATE fluxo_operacoes SET " + ", ".join(sets) + " WHERE id = ? AND status = 'em_andamento'", vals)
            if cur.rowcount == 0:
                conn.rollback()
                return jsonify(erro="Este serviço já foi encerrado."), 409
            conn.commit()
            return jsonify(ok=True)
        finally:
            cur.close()

    @bp.post("/api/fluxo/operacoes/<op_id>/finalizar")
    @exige(OPERADOR)
    @com_banco
    def api_finalizar(conn, op_id):
        cur = conn.cursor()
        try:
            r = por_id(cur, op_id)
            if not r:
                return jsonify(erro="Serviço não encontrado."), 404
            if r[3] != "concluida":
                ag = agora_utc()
                cur.execute("UPDATE fluxo_operacoes SET status = 'concluida', etapa = 'fim', fim_em = ?, atualizado_em = ? "
                            "WHERE id = ? AND status = 'em_andamento'", (ag, ag, op_id))
                conn.commit()
                r = por_id(cur, op_id)
            return jsonify(agora=agora_ms(), op=op_json(r))
        finally:
            cur.close()

    # ---------------- fotos ----------------
    @bp.post("/api/fluxo/operacoes/<op_id>/fotos")
    @exige(OPERADOR)
    @com_banco
    def api_foto_enviar(conn, op_id):
        arq, tipo = request.files.get("foto"), request.form.get("tipo", "andamento")
        if not arq or tipo not in FOTO_TIPOS:
            return jsonify(erro="Foto não recebida."), 400
        dados = arq.read(MAX_FOTO + 1)
        if len(dados) > MAX_FOTO:
            return jsonify(erro="Foto muito grande."), 413
        mime = tipo_imagem(dados)
        if not mime:
            return jsonify(erro="O arquivo não é uma foto válida."), 400
        cur = conn.cursor()
        try:
            cur.execute("SELECT status FROM fluxo_operacoes WHERE id = ?", (op_id,))
            row = cur.fetchone()
            if not row:
                return jsonify(erro="Serviço não encontrado."), 404
            if row[0] != "em_andamento":
                return jsonify(erro="Este serviço já foi encerrado."), 409
            fid = str(uuid.uuid4())
            cur.execute("INSERT INTO fluxo_fotos (id, operacao_id, tipo, mime, tamanho, conteudo, criado_por, criado_em) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (fid, op_id, tipo, mime, len(dados), dados, request.environ.get("usuario_logado"), agora_utc()))
            conn.commit()
            return jsonify(id=fid), 201
        finally:
            cur.close()

    @bp.get("/api/fluxo/operacoes/<op_id>/fotos")
    @exige(QUALQUER)
    @com_banco
    def api_foto_lista(conn, op_id):
        cur = conn.cursor()
        try:
            cur.execute("SELECT id, tipo FROM fluxo_fotos WHERE operacao_id = ? ORDER BY criado_em", (op_id,))
            return jsonify(fotos=[{"id": r[0], "tipo": r[1]} for r in cur.fetchall()])
        finally:
            cur.close()

    @bp.get("/api/fluxo/fotos/<foto_id>")
    @exige(QUALQUER)
    @com_banco
    def api_foto(conn, foto_id):
        cur = conn.cursor()
        try:
            cur.execute("SELECT mime, conteudo FROM fluxo_fotos WHERE id = ?", (foto_id,))
            r = cur.fetchone()
            if not r:
                return jsonify(erro="Foto não encontrada."), 404
            return Response(bytes(r[1]), mimetype=r[0], headers={"Cache-Control": "private, max-age=86400"})
        finally:
            cur.close()

    # ---------------- gestão ----------------
    @bp.get("/api/fluxo/operacoes")
    @exige(GESTAO)
    @com_banco
    def api_operacoes(conn):
        try:
            lim = max(1, min(int(request.args.get("limite", 5000)), 5000))
        except ValueError:
            lim = 5000
        cur = conn.cursor()
        try:
            cur.execute(f"SELECT {COLS} {FROM_OP} ORDER BY o.inicio_em DESC")
            return jsonify(agora=agora_ms(), operacoes=[op_json(r) for r in cur.fetchmany(lim)])
        finally:
            cur.close()

    return bp
