"""Módulo FLUXO — Gestão de Operações de Espaços (montagem e desmontagem).

Fica isolado do resto do sistema:
  - páginas:  /fluxo/            (operador, via QR Code)  e  /fluxo/#admin  (gestão)
  - API:      /api/fluxo/...
  - banco:    tabelas fluxo_espacos, fluxo_operacoes, fluxo_fotos
  - arquivos: pasta fluxo/ (nada dentro de Frontend/)

Reaproveita do app.py: a conexão com o banco e o controle de acesso (exige_permissao).
"""


def register_fluxo(app, get_db_connection, exige_permissao):
    from .routes import criar_blueprint

    app.register_blueprint(criar_blueprint(get_db_connection, exige_permissao))
