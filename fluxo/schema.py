"""Esquema do banco do Fluxo (SQL Server / Azure SQL). Idempotente: pode rodar várias vezes."""
import re
import unicodedata


def slugify(nome):
    s = unicodedata.normalize("NFD", nome).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


NOMES_ESPACOS = [
    "Espaço de Convivência", "Sala Curitiba", "Sala Cascavel", "Sala Paraná", "Sala Maringá",
    "Espaço Araucária", "Sala Londrina", "Sala Guarapuava", "Sala Ponta Grossa",
    "Sala Francisco Beltrão", "Sala Toledo", "Sala Apucarana", "Auditório Mario De Mari",
    "Auditório Caio Amaral", "Átrio I", "Átrio II", "Átrio III", "Outros",
]
SLUGS_FIXOS = {"Espaço de Convivência": "espaco-convivencia"}   # slug oficial definido pela gestão
ESPACOS = [(SLUGS_FIXOS.get(n) or slugify(n), n) for n in NOMES_ESPACOS]

DDL = [
    """IF OBJECT_ID('fluxo_espacos', 'U') IS NULL
CREATE TABLE fluxo_espacos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    slug NVARCHAR(80) NOT NULL UNIQUE,
    nome NVARCHAR(120) NOT NULL,
    ativo BIT NOT NULL DEFAULT 1,
    ordem INT NOT NULL DEFAULT 0
)""",
    """IF OBJECT_ID('fluxo_operacoes', 'U') IS NULL
CREATE TABLE fluxo_operacoes (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    espaco_id INT NOT NULL REFERENCES fluxo_espacos(id),
    status NVARCHAR(20) NOT NULL DEFAULT 'em_andamento',
    etapa NVARCHAR(20) NOT NULL DEFAULT 'tipo',
    tipo NVARCHAR(20) NULL,
    layout_antes NVARCHAR(120) NULL,
    layout_depois NVARCHAR(120) NULL,
    evento NVARCHAR(200) NULL,
    chapas NVARCHAR(300) NULL,
    desc_final NVARCHAR(300) NULL,
    inicio_em DATETIME2 NOT NULL,
    fim_em DATETIME2 NULL,
    criado_por NVARCHAR(200) NULL,
    atualizado_em DATETIME2 NOT NULL
)""",
    """IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_fluxo_operacao_aberta')
CREATE UNIQUE INDEX UX_fluxo_operacao_aberta ON fluxo_operacoes (espaco_id) WHERE status = 'em_andamento'""",
    """IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fluxo_operacoes_inicio')
CREATE INDEX IX_fluxo_operacoes_inicio ON fluxo_operacoes (inicio_em DESC)""",
    """IF OBJECT_ID('fluxo_fotos', 'U') IS NULL
CREATE TABLE fluxo_fotos (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    operacao_id NVARCHAR(36) NOT NULL REFERENCES fluxo_operacoes(id),
    tipo NVARCHAR(20) NOT NULL,
    mime NVARCHAR(50) NOT NULL,
    tamanho INT NOT NULL,
    conteudo VARBINARY(MAX) NOT NULL,
    criado_por NVARCHAR(200) NULL,
    criado_em DATETIME2 NOT NULL
)""",
    """IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fluxo_fotos_operacao')
CREATE INDEX IX_fluxo_fotos_operacao ON fluxo_fotos (operacao_id)""",
]

SEED = ("IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = ?) "
        "INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES (?, ?, ?)")


def ensure_schema(conn):
    cur = conn.cursor()
    try:
        for stmt in DDL:
            cur.execute(stmt)
        for i, (slug, nome) in enumerate(ESPACOS):
            cur.execute(SEED, (slug, slug, nome, i))
        conn.commit()
    finally:
        cur.close()


def sql_script():
    """Mesmo conteúdo, em formato .sql (para rodar no Azure Data Studio / SSMS)."""
    partes = ["-- Fluxo: tabelas e espaços iniciais (idempotente)\n"]
    partes += [d + "\nGO\n" for d in DDL]
    for i, (slug, nome) in enumerate(ESPACOS):
        n = nome.replace("'", "''")
        partes.append(f"IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = '{slug}') "
                      f"INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('{slug}', N'{n}', {i});")
    partes.append("GO\n")
    return "\n".join(partes)
