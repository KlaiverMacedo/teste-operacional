from flask import Flask, request, jsonify, session
import pyodbc
from flask_cors import CORS
from flask_talisman import Talisman
import re
import os
import threading
from functools import lru_cache, wraps
from datetime import datetime
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

app = Flask(__name__, static_folder="Frontend", static_url_path="/")

Talisman(app, force_https=False, content_security_policy=None)
CORS(app, supports_credentials=True)
app.secret_key = os.environ.get("SECRET_KEY", "CHAVE_PADRAO_SUPER_SECRETA_123")

DB_CONFIG = {
    "server": os.environ.get("DB_SERVER"),
    "database": os.environ.get("DB_NAME"),
    "username": os.environ.get("DB_USER"),
    "password": os.environ.get("DB_PASS"),
    "driver": "{ODBC Driver 18 for SQL Server}",
}

# ============================================================================
# 📧 SERVIÇO DE E-MAIL (OUTLOOK / SISTEMA FIEP)
# ============================================================================
SMTP_SERVER = "smtp.office365.com"
SMTP_PORT = 587
SMTP_USER = os.environ.get("SMTP_USER") 
SMTP_PASS = os.environ.get("SMTP_PASS")
ADMIN_EMAILS = ["lilyane@sistemafiep.org.br", "ytalo@sistemafiep.org.br", "leila@sistemafiep.org.br", "klaiver.macedo@sistemafiep.org.br"]

def enviar_email(destinatarios, assunto, corpo_html):
    if not SMTP_USER or not SMTP_PASS:
        print("⚠️ Credenciais de e-mail não configuradas. Pulando envio.")
        return
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_USER
        msg['To'] = ", ".join(destinatarios) if isinstance(destinatarios, list) else destinatarios
        msg['Subject'] = assunto
        msg.attach(MIMEText(corpo_html, 'html'))

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
        server.quit()
        print(f"📧 E-mail enviado com sucesso para: {msg['To']}")
    except Exception as e:
        print(f"❌ Erro ao enviar e-mail: {e}")

_local = threading.local()

def get_db_connection():
    if not hasattr(_local, "conn") or _local.conn is None:
        try:
            conn_str = (
                f"DRIVER={DB_CONFIG['driver']};SERVER={DB_CONFIG['server']};"
                f"DATABASE={DB_CONFIG['database']};UID={DB_CONFIG['username']};"
                f"PWD={DB_CONFIG['password']};Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
            )
            _local.conn = pyodbc.connect(conn_str, autocommit=False)
        except Exception as e:
            print(f"❌ Erro ao conectar: {e}")
            return None
    return _local.conn

def close_db_connection():
    if hasattr(_local, "conn") and _local.conn:
        _local.conn.close()
        _local.conn = None

@app.teardown_appcontext
def teardown_db(error=None):
    close_db_connection()

def criar_slug_para_codigo(nome):
    slug = nome.lower().replace(" ", "_")
    return re.sub(r"[^a-z0-9_]", "", slug)

# -------------------------------------------------------------------------
# CACHE DE EVENTOS
# -------------------------------------------------------------------------
@lru_cache(maxsize=50)
def get_cached_eventos():
    conn = get_db_connection()
    if not conn: return []
    cursor = conn.cursor()
    cursor.execute("""
        SELECT e.id, e.nome, e.tipo_bebida, e.tipo_acesso, CONVERT(varchar, e.data_evento, 103) as data,
               ISNULL(e.capacidade, 0) as capacidade,
               (SELECT COUNT(*) FROM vouchers v WHERE v.evento_id = e.id AND v.status != 'cancelado') as total_gerados
        FROM eventos e 
        WHERE e.status_exclusao = 'ativo' 
        ORDER BY e.id DESC
    """)
    eventos = [{"id": row[0], "nome": row[1], "tipo_bebida": row[2], "tipo_acesso": row[3], "data": row[4], "capacidade": row[5], "total_gerados": row[6]} for row in cursor.fetchall()]
    cursor.close()
    return eventos

def clear_cache():
    get_cached_eventos.cache_clear()

# ============================================================================
# 🛡️ GUARDA-COSTAS DE AUTORIZAÇÃO (RBAC)
# ============================================================================
def exige_permissao(papeis_permitidos):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            email_usuario_cru = request.headers.get('X-MS-CLIENT-PRINCIPAL-NAME')
            
            if not email_usuario_cru:
                return jsonify({"erro": "Não autenticado pela Microsoft"}), 401

            email_usuario = email_usuario_cru.strip().lower()

            conn = get_db_connection()
            if not conn:
                return jsonify({"erro": "Falha no banco de dados"}), 500
            
            cursor = conn.cursor()
            cursor.execute("SELECT nivel_acesso FROM usuarios WHERE LOWER(LTRIM(RTRIM(email))) = ?", (email_usuario,))
            row = cursor.fetchone()
            cursor.close()

            if not row:
                return jsonify({"erro": f"Acesso Negado: Usuário '{email_usuario}' não cadastrado."}), 403

            nivel_usuario = row[0].lower() if row[0] else 'visitante'

            if nivel_usuario != 'master' and nivel_usuario not in papeis_permitidos:
                return jsonify({"erro": f"Acesso Negado. Perfil insuficiente."}), 403

            request.environ['usuario_logado'] = email_usuario
            request.environ['nivel_usuario'] = nivel_usuario
            return f(*args, **kwargs)
        return decorated_function
    return decorator


# ============================================================================
# 🔓 ROTAS PÚBLICAS E DE VALIDAÇÃO
# ============================================================================
@app.route("/")
def index():
    return app.send_static_file("index.html")

@app.route("/validador.html")
def serve_validador():
    return app.send_static_file("validador.html")

@app.route("/voucher/validar", methods=["POST"])
def validar_voucher():
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        codigo = request.json.get("codigo")
        if not codigo: return jsonify({"erro": "Código não fornecido"}), 400

        cursor.execute("""
            SELECT v.status, e.nome as evento_nome, e.data_validade
            FROM vouchers v INNER JOIN eventos e ON v.evento_id = e.id WHERE v.codigo = ?
        """, (codigo,))
        row = cursor.fetchone()

        if not row: return jsonify({"status": "voucher_nao_encontrado"}), 404

        status, evento_nome, data_validade = row
        if data_validade < datetime.now().date():
            return jsonify({"status": "expirado", "evento_nome": evento_nome}), 400

        if status == "usado":
            return jsonify({"status": "ja_utilizado", "evento_nome": evento_nome}), 400
        elif status == "ativo":
            cursor.execute("UPDATE vouchers SET status = 'usado', utilizado_em = GETDATE() WHERE codigo = ?", (codigo,))
            conn.commit()
            return jsonify({"status": "sucesso", "evento_nome": evento_nome}), 200
        else:
            return jsonify({"status": "invalido", "evento_nome": evento_nome}), 400
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()


# ============================================================================
# 🔒 ROTAS PROTEGIDAS DO SISTEMA
# ============================================================================
@app.route("/evento", methods=["POST"])
@exige_permissao(['admin', 'operacional'])
def cadastrar_evento():
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        data = request.json
        email_logado = request.environ.get('usuario_logado', 'Sistema')
        
        cursor.execute("SELECT nome FROM usuarios WHERE email = ?", (email_logado,))
        user_row = cursor.fetchone()
        nome_criador = user_row[0] if user_row else email_logado

        tipo_acesso = data.get("tipo_acesso", "interno") # Suporta 'atrio', 'interno', 'externo'

        cursor.execute(
            """
            SET NOCOUNT ON;
            INSERT INTO eventos (nome, data_evento, data_validade, tipo_bebida, tipo_acesso, capacidade, criado_por) 
            VALUES (?, ?, DATEADD(DAY, 30, ?), ?, ?, ?, ?);
            SELECT SCOPE_IDENTITY();
            """,
            (data["nome"], data["data"], data["data"], data.get("tipo_bebida", "com_bebida"), tipo_acesso, data.get("capacidade", 0), nome_criador),
        )
        resultado = cursor.fetchone()
        last_id = int(resultado[0]) if resultado and resultado[0] else 0
        conn.commit()
        clear_cache()

        # Dispara e-mail de notificação de novo evento
        corpo = f"<h3>Novo Evento Criado: {data['nome']}</h3><p>Olá,</p><p>O usuário <b>{nome_criador}</b> acabou de cadastrar um novo evento com capacidade para {data['capacidade']} vouchers.</p><p>Acesso: {tipo_acesso.upper()}</p>"
        threading.Thread(target=enviar_email, args=(ADMIN_EMAILS, f"Novo Evento Cadastrado - {data['nome']}", corpo)).start()

        return jsonify({"sucesso": "Evento cadastrado", "id": last_id}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

# -------------------------------------------------------------------------
# FLUXO DE EXCLUSÃO DE EVENTOS
# -------------------------------------------------------------------------
@app.route("/eventos/solicitar-exclusao/<int:evento_id>", methods=["POST"])
@exige_permissao(['operacional', 'admin', 'master'])
def solicitar_exclusao(evento_id):
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        data = request.json
        motivo = data.get("motivo", "Nenhum motivo fornecido")
        usuario_solicitante = data.get("usuario", request.environ.get('usuario_logado', 'Operacional'))
        
        cursor.execute("""
            UPDATE eventos 
            SET status_exclusao = 'aguardando', 
                solicitado_por = ?, 
                motivo_exclusao = ?, 
                data_solicitacao = GETDATE()
            WHERE id = ? AND status_exclusao = 'ativo'
        """, (usuario_solicitante, motivo, evento_id))
        
        if cursor.rowcount == 0:
            return jsonify({"erro": "Evento não encontrado ou já está aguardando exclusão."}), 400
            
        conn.commit()
        clear_cache()

        # Dispara e-mail para administradores
        corpo = f"<h3>Ação Necessária: Solicitação de Exclusão de Evento</h3><p>O usuário <b>{usuario_solicitante}</b> solicitou a exclusão do evento ID {evento_id}.</p><p><b>Motivo:</b> {motivo}</p><p>Por favor, acesse o sistema para aprovar ou rejeitar.</p>"
        threading.Thread(target=enviar_email, args=(ADMIN_EMAILS, "Ação Necessária - Exclusão de Evento", corpo)).start()

        return jsonify({"sucesso": "Solicitação enviada! Aguardando aprovação."}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/eventos/aprovar-exclusao/<int:evento_id>", methods=["POST"])
@exige_permissao(['admin', 'master'])
def aprovar_exclusao(evento_id):
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        usuario_aprovador = request.environ.get('usuario_logado', 'Admin')
        
        cursor.execute("""
            UPDATE eventos 
            SET status_exclusao = 'excluido', 
                aprovado_por = ?, 
                data_aprovacao = GETDATE()
            WHERE id = ? AND status_exclusao = 'aguardando'
        """, (usuario_aprovador, evento_id))
        
        if cursor.rowcount == 0:
            return jsonify({"erro": "Nenhuma solicitação pendente encontrada para este evento."}), 400
        
        cursor.execute("UPDATE vouchers SET status = 'cancelado' WHERE evento_id = ? AND status = 'ativo'", (evento_id,))
        
        conn.commit()
        clear_cache()
        return jsonify({"sucesso": "Exclusão aprovada. O evento foi arquivado."}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/eventos/pendentes-exclusao", methods=["GET"])
@exige_permissao(['admin', 'master', 'operacional'])
def listar_pendentes_exclusao():
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, nome, motivo_exclusao, solicitado_por, FORMAT(data_solicitacao, 'dd/MM/yyyy HH:mm'),
                   status_exclusao, aprovado_por, FORMAT(data_aprovacao, 'dd/MM/yyyy HH:mm')
            FROM eventos 
            WHERE status_exclusao IN ('aguardando', 'excluido') 
            ORDER BY data_solicitacao DESC
        """)
        
        pendentes = [{"id": r[0], "nome": r[1], "motivo": r[2], "solicitado_por": r[3], "data_solicitacao": r[4], 
                      "status_exclusao": r[5], "aprovado_por": r[6], "data_aprovacao": r[7]} for r in cursor.fetchall()]
        return jsonify(pendentes), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

# -------------------------------------------------------------------------
# GERADOR DE VOUCHERS E RELATÓRIOS
# -------------------------------------------------------------------------
@app.route("/vouchers/gerar", methods=["POST"])
@exige_permissao(['admin', 'operacional'])
def generar_vouchers_endpoint():
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        data = request.json
        evento_id = data.get("evento_id")
        quantidade = data.get("quantidade")
        
        cursor.execute("SELECT id, nome, tipo_bebida, tipo_acesso, ISNULL(capacidade, 0) FROM eventos WHERE id = ?", (evento_id,))
        evento = cursor.fetchone()
        if not evento: return jsonify({"erro": "Evento não encontrado"}), 404
        
        capacidade_maxima = evento[4]
        
        cursor.execute("SELECT COUNT(*) FROM vouchers WHERE evento_id = ? AND status != 'cancelado'", (evento_id,))
        total_gerados = cursor.fetchone()[0]
        
        if (total_gerados + quantidade) > capacidade_maxima:
            restante = capacidade_maxima - total_gerados
            if restante <= 0:
                return jsonify({"erro": "Este evento já atingiu a lotação máxima."}), 400
            else:
                return jsonify({"erro": f"Capacidade excedida. Você só pode gerar mais {restante} voucher(s)."}), 400
        
        slug_curto = criar_slug_para_codigo(evento[1])[:3]
        nome_base = f"{slug_curto}{evento_id}"
        
        cursor.execute("SELECT codigo FROM vouchers WHERE evento_id = ?", (evento_id,))
        codigos = cursor.fetchall()
        
        max_num = 0
        for row in codigos:
            codigo_atual = row[0]
            partes = codigo_atual.rsplit('_', 1)
            if len(partes) == 2 and partes[1].isdigit():
                num = int(partes[1])
                if num > max_num:
                    max_num = num
                    
        proximo_numero = max_num + 1

        for i in range(quantidade):
            codigo = f"{nome_base}_{proximo_numero:06d}"
            cursor.execute("INSERT INTO vouchers (codigo, evento_id, status, criado_em) VALUES (?, ?, 'ativo', GETDATE())", (codigo, evento_id))
            proximo_numero += 1
            
        conn.commit()

        cursor.execute("""
            SELECT TOP (?) v.id, v.codigo, e.nome AS nome_evento, FORMAT(e.data_evento, 'dd/MM/yyyy') AS data_formatada,
            FORMAT(v.criado_em, 'dd/MM/yyyy') AS data_criacao, FORMAT(e.data_validade, 'dd/MM/yyyy') AS data_expiracao, e.tipo_bebida, e.tipo_acesso
            FROM vouchers v INNER JOIN eventos e ON v.evento_id = e.id WHERE v.evento_id = ? ORDER BY v.id DESC
        """, (quantidade, evento_id))
        
        vouchers_gerados = [{"id": r[0], "codigo": r[1], "nome_evento": r[2], "data_formatada": r[3], "data_criacao": r[4], "data_expiracao": r[5], "tipo_bebida": r[6], "tipo_acesso": r[7]} for r in cursor.fetchall()]
        
        return jsonify({"sucesso": f"{quantidade} vouchers gerados", "vouchers": vouchers_gerados, "tipo_bebida": evento[2], "tipo_acesso": evento[3]}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/eventos", methods=["GET"])
@exige_permissao(['admin', 'operacional', 'visitante'])
def listar_eventos():
    return jsonify(get_cached_eventos()), 200

@app.route("/vouchers/<int:evento_id>", methods=["GET"])
@exige_permissao(['admin', 'operacional'])
def acessar_vouchers(evento_id):
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT v.id, v.codigo, e.nome AS nome_evento, FORMAT(e.data_evento, 'dd/MM/yyyy') AS data_formatada,
            FORMAT(v.criado_em, 'dd/MM/yyyy') AS data_criacao, FORMAT(e.data_validade, 'dd/MM/yyyy') AS data_expiracao, e.tipo_bebida, e.tipo_acesso
            FROM vouchers v INNER JOIN eventos e ON v.evento_id = e.id 
            WHERE v.evento_id = ? AND v.status = 'ativo' 
            ORDER BY v.criado_em DESC
        """, (evento_id,))
        
        vouchers = [{"id": r[0], "codigo": r[1], "nome_evento": r[2], "data_formatada": r[3], "data_criacao": r[4], "data_expiracao": r[5], "tipo_bebida": r[6], "tipo_acesso": r[7]} for r in cursor.fetchall()]
        
        if not vouchers: return jsonify({"erro": "Nenhum voucher ATIVO encontrado para impressão neste evento."}), 404
        
        return jsonify({"vouchers": vouchers}), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/relatorios", methods=["GET"])
@exige_permissao(['admin', 'operacional', 'visitante'])
def obter_relatorios():
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha no banco"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT e.id, e.nome, FORMAT(e.data_evento, 'dd/MM/yyyy') as data_evento, COUNT(v.id) as total_vouchers,
            SUM(CASE WHEN v.status = 'ativo' AND e.data_validade >= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) as ativos,
            SUM(CASE WHEN v.status = 'usado' THEN 1 ELSE 0 END) as usados,
            SUM(CASE WHEN v.status = 'expirado' OR (v.status = 'ativo' AND e.data_validade < CAST(GETDATE() AS DATE)) THEN 1 ELSE 0 END) as expirados,
            SUM(CASE WHEN v.status = 'devolvido' THEN 1 ELSE 0 END) as devolvidos,
            e.tipo_acesso, e.tipo_bebida, ISNULL(e.criado_por, 'Sistema') as criado_por,
            e.status_exclusao,
            SUM(CASE WHEN v.status = 'cancelado' THEN 1 ELSE 0 END) as cancelados
            FROM eventos e LEFT JOIN vouchers v ON e.id = v.evento_id 
            GROUP BY e.id, e.nome, e.data_evento, e.data_validade, e.tipo_acesso, e.tipo_bebida, e.criado_por, e.status_exclusao 
            ORDER BY e.id DESC
        """)
        relatorios = []
        for r in cursor.fetchall():
            total = int(r[3]) if r[3] else 0
            usados = int(r[5]) if r[5] else 0
            relatorios.append({
                "id": r[0], "nome": r[1], "data_evento": r[2], "total_vouchers": total, 
                "ativos": int(r[4]) if r[4] else 0, "usados": usados, 
                "expirados": int(r[6]) if r[6] else 0, "devolvidos": int(r[7]) if r[7] else 0,
                "percentual_uso": round((usados / total) * 100, 2) if total > 0 else 0,
                "tipo_acesso": r[8], "tipo_bebida": r[9], "criado_por": r[10],
                "status_exclusao": r[11],
                "cancelados": int(r[12]) if r[12] else 0
            })
        return jsonify(relatorios), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/api/controle-emissoes", methods=["GET"])
def controle_emissoes():
    conn = get_db_connection()
    if not conn: 
        return jsonify([])
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT e.nome, 
                   FORMAT(e.data_evento, 'dd/MM/yyyy') as data_evento, 
                   ISNULL(e.capacidade, 0) as capacidade,
                   (SELECT COUNT(*) FROM vouchers v WHERE v.evento_id = e.id AND v.status != 'cancelado') as gerados
            FROM eventos e
            WHERE e.status_exclusao = 'ativo'
            ORDER BY e.id DESC
        """)
        
        dados = [{"evento": r[0], "data": r[1], "capacidade": r[2], "gerados": r[3]} for r in cursor.fetchall()]
        return jsonify(dados), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/api/devolucoes", methods=["POST", "GET"])
@exige_permissao(['admin', 'operacional'])
def rotas_devolucao():
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        if request.method == "GET":
            cursor.execute("""
                SELECT d.id, d.evento_id, d.quantidade, d.data_devolucao, d.responsavel, d.observacoes, d.data_registro, e.nome as evento_nome, FORMAT(d.data_devolucao, 'dd/MM/yyyy') as data_devolucao_formatada
                FROM devolucoes d JOIN eventos e ON d.evento_id = e.id ORDER BY d.data_registro DESC
            """)
            devs = [{"id": r[0], "evento_id": r[1], "quantidade": r[2], "data_devolucao": r[3], "responsavel": r[4], "observacoes": r[5], "data_registro": r[6], "evento_nome": r[7], "data_devolucao_formatada": r[8]} for r in cursor.fetchall()]
            return jsonify(devs), 200
        else:
            data = request.json
            cursor.execute("""
                INSERT INTO devolucoes (evento_id, quantidade, data_devolucao, responsavel, observacoes) OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?)
            """, (data["evento_id"], data["quantidade"], data["data_devolucao"], data["responsavel"], data.get("observacoes", "")))
            devolucao_id = int(cursor.fetchone()[0])
            cursor.execute("UPDATE TOP (?) vouchers SET status = 'devolvido', data_devolucao = ?, responsavel_devolucao = ? WHERE evento_id = ? AND status = 'ativo'", (data["quantidade"], data["data_devolucao"], data["responsavel"], data["evento_id"]))
            conn.commit()
            clear_cache()
            return jsonify({"success": True, "message": "Devolução registrada", "id": devolucao_id if 'devolucao_id' in locals() else 0}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/logout", methods=["GET", "POST"])
def logout():
    session.clear()
    return jsonify({"sucesso": "Sessão local encerrada."}), 200

# =========================================================
# ROTAS DE AUTENTICAÇÃO E GESTÃO DE USUÁRIOS
# =========================================================
@app.route("/auth/me", methods=["GET"])
def get_user_role():
    email_logado_cru = request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME")
    if not email_logado_cru:
        email_logado_cru = request.args.get("email", "klaiver.macedo@sistemafiep.org.br")

    email_logado = email_logado_cru.strip().lower()

    conn = get_db_connection()
    if not conn:
        return jsonify({"email": email_logado, "nivel_acesso": "visitante"}), 500
        
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT nome, nivel_acesso FROM usuarios WHERE LOWER(LTRIM(RTRIM(email))) = ?", (email_logado,))
        row = cursor.fetchone()
        
        if row:
            return jsonify({"email": email_logado, "nome": row[0], "nivel_acesso": row[1]}), 200
        else:
            return jsonify({"email": email_logado, "nivel_acesso": "visitante"}), 200
    except Exception as e:
        return jsonify({"email": email_logado, "nivel_acesso": "visitante", "erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/api/usuarios", methods=["GET"])
@exige_permissao(['master'])
def listar_usuarios():
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, nome, email, nivel_acesso, FORMAT(criado_em, 'dd/MM/yyyy HH:mm') as criado_em FROM usuarios ORDER BY nome ASC")
        usuarios = [{"id": r[0], "nome": r[1], "email": r[2], "nivel_acesso": r[3], "criado_em": r[4]} for r in cursor.fetchall()]
        return jsonify(usuarios), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/api/usuarios", methods=["POST"])
@exige_permissao(['master'])
def cadastrar_usuario():
    data = request.json
    nome = data.get("nome")
    email = data.get("email")
    nivel = data.get("nivel_acesso", "visitante")
    
    if not nome or not email:
        return jsonify({"erro": "Nome e e-mail são obrigatórios"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM usuarios WHERE email = ?", (email,))
        if cursor.fetchone():
            return jsonify({"erro": "Este e-mail já está cadastrado no sistema."}), 400
            
        cursor.execute("""
            INSERT INTO usuarios (nome, email, nivel_acesso, criado_em) 
            VALUES (?, ?, ?, GETDATE())
        """, (nome, email, nivel))
        conn.commit()
        return jsonify({"sucesso": f"Usuário {nome} cadastrado com sucesso!"}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/api/usuarios/<int:usuario_id>", methods=["DELETE"])
@exige_permissao(['master'])
def deletar_usuario(usuario_id):
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM usuarios WHERE id = ?", (usuario_id,))
        conn.commit()
        return jsonify({"sucesso": "Usuário removido com sucesso!"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

# ============================================================================
# RELATÓRIO DE ENTRADAS (CHECK-IN)
# ============================================================================
@app.route("/api/relatorio-entradas/<int:evento_id>", methods=["GET"])
@exige_permissao(['admin', 'operacional', 'visitante'])
def relatorio_entradas(evento_id):
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT nome, FORMAT(data_evento, 'dd/MM/yyyy') FROM eventos WHERE id = ?", (evento_id,))
        evento_info = cursor.fetchone()
        
        if not evento_info:
            return jsonify({"erro": "Evento não encontrado"}), 404

        nome_evento, data_evento = evento_info

        cursor.execute("""
            SELECT 
                codigo, 
                status, 
                ISNULL(FORMAT(DATEADD(hour, -3, utilizado_em), 'dd/MM/yyyy'), 'N/A') as data_uso,
                ISNULL(FORMAT(DATEADD(hour, -3, utilizado_em), 'HH:mm:ss'), 'N/A') as hora_uso,
                (SELECT e.tipo_acesso FROM eventos e WHERE e.id = v.evento_id) as tipo_acesso,
                (SELECT e.tipo_bebida FROM eventos e WHERE e.id = v.evento_id) as tipo_bebida
            FROM vouchers v 
            WHERE evento_id = ? AND status != 'cancelado'
            ORDER BY utilizado_em DESC, codigo ASC
        """, (evento_id,))
        
        entradas = []
        for r in cursor.fetchall():
            entradas.append({
                "codigo": r[0],
                "status": r[1],
                "data_uso": r[2],
                "hora_uso": r[3],
                "tipo_acesso": str(r[4]).upper(),
                "tipo_bebida": "COM BEBIDA" if r[5] == "com_bebida" else "SEM BEBIDA"
            })
            
        return jsonify({"evento": nome_evento, "data_evento": data_evento, "entradas": entradas}), 200

    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

# ============================================================================
# RELATÓRIO DIÁRIO (USO POR DATA)
# ============================================================================
@app.route("/api/relatorio-diario", methods=["GET"])
@exige_permissao(['admin', 'operacional', 'visitante'])
def relatorio_diario():
    data_filtro = request.args.get("data")
    if not data_filtro:
        return jsonify({"erro": "Data não fornecida"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT 
                v.codigo, 
                e.nome as evento_nome, 
                ISNULL(FORMAT(DATEADD(hour, -3, v.utilizado_em), 'HH:mm:ss'), 'N/A') as hora_uso,
                e.tipo_acesso, 
                e.tipo_bebida, 
                ISNULL(e.criado_por, 'Sistema') as criado_por
            FROM vouchers v 
            INNER JOIN eventos e ON v.evento_id = e.id 
            WHERE v.status = 'usado' 
              AND CAST(DATEADD(hour, -3, v.utilizado_em) AS DATE) = ?
            ORDER BY v.utilizado_em DESC
        """, (data_filtro,))
        
        registros = []
        for r in cursor.fetchall():
            registros.append({
                "codigo": r[0], "evento": r[1], "hora_uso": r[2],
                "tipo_acesso": str(r[3]).upper(),
                "tipo_bebida": "COM BEBIDA" if r[4] == "com_bebida" else "SEM BEBIDA", "criado_por": r[5]
            })
            
        return jsonify(registros), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

# ============================================================================
# CANCELAMENTO DE VOUCHERS E APROVAÇÕES DO ADMIN
# ============================================================================
@app.route("/api/vouchers/cancelar-lote", methods=["POST"])
@exige_permissao(['master', 'admin', 'operacional'])
def cancelar_lote():
    dados = request.get_json()
    ids_para_cancelar = dados.get("ids", [])
    
    if not ids_para_cancelar:
        return jsonify({"erro": "Nenhum voucher selecionado para cancelamento."}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"erro": "Falha na conexão com o banco"}), 500

    try:
        cursor = conn.cursor()
        placeholders = ', '.join(['?'] * len(ids_para_cancelar))
        query = f"UPDATE vouchers SET status = 'cancelado' WHERE id IN ({placeholders}) AND status = 'ativo'"
        cursor.execute(query, ids_para_cancelar)
        linhas_afetadas = cursor.rowcount
        conn.commit()
        return jsonify({"sucesso": f"{linhas_afetadas} voucher(s) cancelado(s) com sucesso."}), 200
    except Exception as e:
        return jsonify({"erro": f"Erro ao processar cancelamento: {str(e)}"}), 500
    finally:
        cursor.close()

@app.route('/api/vouchers/solicitar-cancelamento', methods=['POST'])
@exige_permissao(['operacional', 'admin', 'master'])
def solicitar_cancelamento():
    dados = request.get_json()
    ids_vouchers = dados.get('ids', [])
    motivo = dados.get('motivo', '')
    usuario_solicitante = dados.get('usuario', request.environ.get('usuario_logado', 'Operacional'))
    
    if not ids_vouchers: return jsonify({"erro": "Nenhum voucher selecionado."}), 400
    if not motivo: return jsonify({"erro": "O motivo é obrigatório."}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão com o banco"}), 500

    try:
        cursor = conn.cursor()
        placeholders = ', '.join(['?'] * len(ids_vouchers))
        query = f"""
            UPDATE vouchers 
            SET status = 'aguardando_cancelamento', 
                motivo_cancelamento = ?, 
                solicitado_cancelamento_por = ? 
            WHERE id IN ({placeholders}) AND (status = 'ativo' OR status IS NULL)
        """
        parametros = [motivo, usuario_solicitante] + ids_vouchers
        cursor.execute(query, parametros)
        linhas_afetadas = cursor.rowcount
        conn.commit()

        # Dispara e-mail de notificação de cancelamento para o Admin
        corpo = f"<h3>Ação Necessária: Cancelamento Solicitado</h3><p>O usuário <b>{usuario_solicitante}</b> solicitou o cancelamento em lote de {linhas_afetadas} voucher(s).</p><p><b>Motivo:</b> {motivo}</p><p>Por favor, acesse o sistema para aprovar.</p>"
        threading.Thread(target=enviar_email, args=(ADMIN_EMAILS, "Ação Necessária - Solicitação de Cancelamento", corpo)).start()

        return jsonify({"sucesso": f"Solicitação de cancelamento para {linhas_afetadas} voucher(s) enviada ao Admin com sucesso!"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": f"Erro ao solicitar cancelamento: {str(e)}"}), 500
    finally:
        cursor.close()

@app.route("/api/vouchers/pendentes-cancelamento", methods=["GET"])
@exige_permissao(['admin', 'master'])
def listar_pendentes_cancelamento():
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT v.id, v.codigo, e.nome as evento_nome, v.motivo_cancelamento, v.solicitado_cancelamento_por, FORMAT(v.criado_em, 'dd/MM/yyyy HH:mm')
            FROM vouchers v INNER JOIN eventos e ON v.evento_id = e.id
            WHERE v.status = 'aguardando_cancelamento'
            ORDER BY v.criado_em DESC
        """)
        pendentes = [{"id": r[0], "codigo": r[1], "evento_nome": r[2], "motivo": r[3], "solicitado_por": r[4], "data": r[5]} for r in cursor.fetchall()]
        return jsonify(pendentes), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/api/vouchers/aprovar-cancelamento", methods=["POST"])
@exige_permissao(['admin', 'master'])
def aprovar_cancelamento():
    dados = request.get_json()
    ids = dados.get('ids', [])
    if not ids: return jsonify({"erro": "Nenhum voucher selecionado para aprovação."}), 400
    
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    try:
        cursor = conn.cursor()
        placeholders = ', '.join(['?'] * len(ids))
        query = f"UPDATE vouchers SET status = 'cancelado' WHERE id IN ({placeholders}) AND status = 'aguardando_cancelamento'"
        cursor.execute(query, ids)
        linhas = cursor.rowcount
        conn.commit()
        return jsonify({"sucesso": f"{linhas} voucher(s) cancelado(s) definitivamente com sucesso!"}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

# ============================================================================
# CONFIGURAÇÕES E PREÇOS DINÂMICOS
# ============================================================================
@app.route("/api/precos", methods=["GET"])
def listar_precos():
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, grupo, tipo_bebida, valor, atualizado_por, FORMAT(atualizado_em, 'dd/MM/yyyy HH:mm') FROM configuracoes_precos")
        precos = [{"id": r[0], "grupo": r[1], "tipo_bebida": r[2], "valor": float(r[3]), "atualizado_por": r[4], "atualizado_em": r[5]} for r in cursor.fetchall()]
        
        cursor.execute("SELECT TOP 20 grupo, tipo_bebida, valor_antigo, valor_novo, modificado_por, FORMAT(data_modificacao, 'dd/MM/yyyy HH:mm') FROM historico_precos ORDER BY data_modificacao DESC")
        logs = [{"grupo": r[0], "bebida": r[1], "de": float(r[2]), "para": float(r[3]), "por": r[4], "data": r[5]} for r in cursor.fetchall()]
        
        return jsonify({"precos": precos, "logs": logs}), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

@app.route("/api/precos", methods=["POST"])
@exige_permissao(['admin', 'master'])
def atualizar_preco():
    data = request.json
    usuario = request.environ.get('usuario_logado', 'Admin')
    conn = get_db_connection()
    if not conn: return jsonify({"erro": "Falha na conexão"}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT valor, grupo, tipo_bebida FROM configuracoes_precos WHERE id = ?", (data['id'],))
        row = cursor.fetchone()
        if row:
            cursor.execute("INSERT INTO historico_precos (grupo, tipo_bebida, valor_antigo, valor_novo, modificado_por) VALUES (?, ?, ?, ?, ?)", (row[1], row[2], row[0], data['novo_valor'], usuario))
            cursor.execute("UPDATE configuracoes_precos SET valor = ?, atualizado_por = ?, atualizado_em = GETDATE() WHERE id = ?", (data['novo_valor'], usuario, data['id']))
            conn.commit()
            return jsonify({"sucesso": "Preço atualizado!"}), 200
        return jsonify({"erro": "Configuração de preço não encontrada"}), 404
    except Exception as e:
        conn.rollback()
        return jsonify({"erro": str(e)}), 500
    finally:
        cursor.close()

# =========================================================
# ESTA LINHA DEVE SER SEMPRE A ÚLTIMA DO ARQUIVO
# =========================================================
# ============================================================================
# 🧩 MÓDULO FLUXO (montagem/desmontagem de espaços) — isolado em /fluxo e /api/fluxo
# Para desativar: apague estas 3 linhas. Nada do sistema atual depende dele.
# ============================================================================
from fluxo import register_fluxo
register_fluxo(app, get_db_connection, exige_permissao)


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=8000)