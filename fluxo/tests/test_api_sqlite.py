"""Teste da API do Fluxo sem SQL Server: usa SQLite em memória no lugar do banco.
Rode na pasta do projeto:  python -m unittest fluxo.tests.test_api_sqlite -v
(Valida regras e permissões. As tabelas reais, em T-SQL, estão em fluxo/schema.py e fluxo/schema.sql.)"""
import datetime, io, os, sqlite3, types, unittest
os.environ["FLUXO_AUTO_SCHEMA"] = "0"
import sys
sys.modules.setdefault("pyodbc", types.SimpleNamespace(IntegrityError=sqlite3.IntegrityError))  # roda sem driver ODBC
from flask import Flask, request, jsonify
from fluxo import routes
from fluxo.schema import ESPACOS

PAPEIS = {"op@x.com": "operacional", "gestor@x.com": "admin", "vis@x.com": "visitante", "mestre@x.com": "master"}
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 100


def exige(papeis):
    def deco(f):
        def w(*a, **k):
            email = request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME")
            if not email:
                return jsonify(erro="x"), 401
            n = PAPEIS.get(email)
            if not n or (n != "master" and n not in papeis):
                return jsonify(erro="x"), 403
            request.environ["usuario_logado"] = email
            return f(*a, **k)
        w.__name__ = f.__name__
        return w
    return deco


class T(unittest.TestCase):
    def setUp(self):
        sqlite3.register_adapter(datetime.datetime, lambda d: d.isoformat(" "))
        sqlite3.register_converter("TIMESTAMP", lambda b: datetime.datetime.fromisoformat(b.decode()))
        self.db = sqlite3.connect(":memory:", detect_types=sqlite3.PARSE_DECLTYPES, check_same_thread=False)
        self.db.executescript("""
        CREATE TABLE fluxo_espacos(id INTEGER PRIMARY KEY, slug TEXT UNIQUE, nome TEXT, ativo INT DEFAULT 1, ordem INT DEFAULT 0);
        CREATE TABLE fluxo_operacoes(id TEXT PRIMARY KEY, espaco_id INT, status TEXT, etapa TEXT, tipo TEXT, layout_antes TEXT,
          layout_depois TEXT, evento TEXT, chapas TEXT, desc_final TEXT, inicio_em TIMESTAMP, fim_em TIMESTAMP, criado_por TEXT, atualizado_em TIMESTAMP);
        CREATE UNIQUE INDEX ux ON fluxo_operacoes(espaco_id) WHERE status='em_andamento';
        CREATE TABLE fluxo_fotos(id TEXT PRIMARY KEY, operacao_id TEXT, tipo TEXT, mime TEXT, tamanho INT, conteudo BLOB, criado_por TEXT, criado_em TIMESTAMP);""")
        for i, (s, n) in enumerate(ESPACOS):
            self.db.execute("INSERT INTO fluxo_espacos(slug,nome,ordem) VALUES(?,?,?)", (s, n, i))
        routes.pyodbc = types.SimpleNamespace(IntegrityError=sqlite3.IntegrityError)
        app = Flask(__name__)
        app.register_blueprint(routes.criar_blueprint(lambda: self.db, exige))
        self.c = app.test_client()

    def h(self, u):
        return {"X-MS-CLIENT-PRINCIPAL-NAME": u}

    def foto(self, op_id, dados, tipo="inicial"):
        return self.c.post("/api/fluxo/operacoes/%s/fotos" % op_id, headers=self.h("op@x.com"),
                           data={"tipo": tipo, "foto": (io.BytesIO(dados), "f.jpg")}, content_type="multipart/form-data")

    def test_fluxo_completo(self):
        op, g = self.h("op@x.com"), self.h("gestor@x.com")
        j = self.c.get("/api/fluxo/sala/sala-curitiba", headers=op).get_json()
        self.assertIsNone(j["op"]); self.assertEqual(j["sala"]["nome"], "Sala Curitiba")
        a = self.c.post("/api/fluxo/sala/sala-curitiba/iniciar", headers=op).get_json()["op"]
        b = self.c.post("/api/fluxo/sala/sala-curitiba/iniciar", headers=op).get_json()["op"]
        self.assertEqual(a["id"], b["id"], "duas chamadas = uma operação só")
        self.assertEqual(self.c.get("/api/fluxo/sala/sala-curitiba", headers=op).get_json()["op"]["id"], a["id"])
        r = self.c.patch("/api/fluxo/operacoes/" + a["id"], headers=op,
                         json={"tipo": "troca", "antes": "Escolar", "depois": "Coquetel", "evento": "Feira", "etapa": "and"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.c.patch("/api/fluxo/operacoes/" + a["id"], headers=op, json={"etapa": "xx"}).status_code, 400)
        self.assertEqual(self.foto(a["id"], JPEG).status_code, 201)
        self.assertEqual(self.foto(a["id"], b"nao e foto", "final").status_code, 400)
        fin = self.c.post("/api/fluxo/operacoes/%s/finalizar" % a["id"], headers=op).get_json()["op"]
        self.assertEqual(fin["status"], "concluida"); self.assertGreaterEqual(fin["fimEm"], fin["inicioEm"])
        self.assertEqual(self.c.patch("/api/fluxo/operacoes/" + a["id"], headers=op, json={"evento": "x"}).status_code, 409)
        self.assertEqual(self.foto(a["id"], JPEG).status_code, 409)
        self.assertEqual(self.c.get("/api/fluxo/sala/sala-curitiba", headers=op).get_json()["recentes"]["evento"], ["Feira"])
        lst = self.c.get("/api/fluxo/operacoes", headers=g).get_json()["operacoes"]
        self.assertEqual(len(lst), 1); self.assertEqual(lst[0]["evento"], "Feira"); self.assertEqual(lst[0]["criadoPor"], "op@x.com")
        fid = self.c.get("/api/fluxo/operacoes/%s/fotos" % a["id"], headers=g).get_json()["fotos"][0]["id"]
        self.assertEqual(self.c.get("/api/fluxo/fotos/" + fid, headers=g).data, JPEG)

    def test_permissoes_e_erros(self):
        self.assertEqual(self.c.get("/api/fluxo/sala/sala-curitiba").status_code, 401)
        self.assertEqual(self.c.get("/api/fluxo/operacoes", headers=self.h("op@x.com")).status_code, 403)
        self.assertEqual(self.c.post("/api/fluxo/sala/sala-curitiba/iniciar", headers=self.h("vis@x.com")).status_code, 403)
        self.assertEqual(self.c.get("/api/fluxo/operacoes", headers=self.h("vis@x.com")).status_code, 200)
        self.assertEqual(self.c.get("/api/fluxo/operacoes", headers=self.h("mestre@x.com")).status_code, 200)
        self.assertEqual(self.c.get("/api/fluxo/sala/xyz", headers=self.h("op@x.com")).status_code, 404)

    def test_salas_independentes(self):
        op = self.h("op@x.com")
        a = self.c.post("/api/fluxo/sala/sala-toledo/iniciar", headers=op).get_json()["op"]
        b = self.c.post("/api/fluxo/sala/sala-cascavel/iniciar", headers=op).get_json()["op"]
        self.assertNotEqual(a["id"], b["id"])

    def test_paginas(self):
        self.assertEqual(self.c.get("/fluxo?sala=sala-curitiba").headers["Location"], "/fluxo/?sala=sala-curitiba")
        self.assertEqual(self.c.get("/fluxo/").status_code, 200)


if __name__ == "__main__":
    unittest.main()
