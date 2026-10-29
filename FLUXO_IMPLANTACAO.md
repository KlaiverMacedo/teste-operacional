# Fluxo no CDE Hub de Eventos — guia de implantação

O Fluxo entra como um **módulo separado** dentro da aplicação que já roda (Flask + Azure SQL + login Microsoft).
Nada do que existe foi alterado: o `app.py` ganhou apenas o bloco final com 3 linhas, antes do `if __name__`.

| O quê | Onde fica |
|---|---|
| Páginas | `/fluxo/` (operador, via QR Code) e `/fluxo/#admin` (gestão) |
| API | `/api/fluxo/...` |
| Banco | tabelas `fluxo_espacos`, `fluxo_operacoes`, `fluxo_fotos` |
| Código | pasta `fluxo/` (backend em `routes.py` e `schema.py`; tela em `fluxo/static/`) |

A pasta `Frontend/` e todas as rotas atuais ficam intactas.

## Como subir (5 passos)

1. **Arquivos.** Se já tem o projeto publicado: copie a pasta `fluxo/` para a raiz, ao lado do `app.py`, e adicione ao final do seu `app.py` (antes do `if __name__ == "__main__":`):
   ```python
   from fluxo import register_fluxo
   register_fluxo(app, get_db_connection, exige_permissao)
   ```
   Ou use o `app.py` deste ZIP, que já tem isso. O `requirements.txt` **não mudou** (nenhuma biblioteca nova).

2. **Banco.** Escolha uma opção:
   - **Recomendada:** rode `fluxo/schema.sql` uma vez no Azure Data Studio ou SSMS, no mesmo banco do sistema. Cria as 3 tabelas e os 18 espaços, e pode ser repetido sem problema.
   - **Automática:** se o usuário do banco (`DB_USER`) puder criar tabelas, o Fluxo cria tudo sozinho na primeira chamada. Para desligar, defina `FLUXO_AUTO_SCHEMA=0`.

3. **Quem pode usar.** O Fluxo usa a mesma tabela `usuarios` e os mesmos perfis de hoje (e-mail Microsoft + `nivel_acesso`):

   | Perfil | Registrar serviços (QR Code) | Painel, relatórios e fotos |
   |---|---|---|
   | `operacional` | sim | não |
   | `admin` | sim | sim |
   | `visitante` | não | sim (só leitura) |
   | `master` | sim | sim |

   O operador de campo precisa ter o e-mail cadastrado como `operacional`. Para mudar quem pode o quê, edite as 3 listas no topo de `fluxo/routes.py` (`OPERADOR`, `GESTAO`, `QUALQUER`).

4. **Publicar no Azure.** Faça o deploy do jeito que você já faz (zip deploy / GitHub / `az webapp deploy`). O comando de inicialização continua o mesmo (o `requirements.txt` já tem `gunicorn`, por exemplo `gunicorn --bind 0.0.0.0:8000 app:app`).
   Se o App Service estiver com "Permitir acesso não autenticado", o Fluxo manda para o login Microsoft quando a sessão expira e volta para a mesma tela.

5. **QR Codes.** Abra `https://SEU-SITE/fluxo/#admin` → **QR Codes** → baixe ou imprima (A4, 3 colunas). Cada código abre `https://SEU-SITE/fluxo/?sala=<slug>`. Se o site tiver outro endereço, mude em **Configurações** antes de imprimir.

## Teste rápido depois de subir
1. Abra `/fluxo/?sala=sala-curitiba` logado como `operacional`: aparece "Sala Curitiba" e **Começar serviço**.
2. Faça um serviço completo (tipo → detalhes → foto → cronômetro → finalizar). Recarregue no meio: o cronômetro continua.
3. Abra `/fluxo/#admin` como `admin`: o serviço aparece no painel e em Relatórios, com fotos, CSV e impressão.
4. Abra o mesmo QR em dois aparelhos: o segundo cai no serviço que já está em andamento (não cria outro).
5. Entre como `operacional` em `#admin`: deve aparecer "Acesso não liberado".

## Rotas criadas
`GET /fluxo/` · `GET /api/fluxo/espacos` · `GET /api/fluxo/sala/<slug>` · `POST /api/fluxo/sala/<slug>/iniciar` ·
`PATCH /api/fluxo/operacoes/<id>` · `POST /api/fluxo/operacoes/<id>/finalizar` ·
`GET|POST /api/fluxo/operacoes/<id>/fotos` · `GET /api/fluxo/fotos/<id>` · `GET /api/fluxo/operacoes`

## Regras que o servidor garante
- Uma operação em andamento por espaço (índice único no banco). Dois toques ou dois aparelhos não duplicam.
- Início e fim usam a hora do servidor; o cronômetro é sempre `agora − início`.
- Serviço encerrado não aceita mais alteração nem foto.
- Fotos: JPEG, PNG ou WebP até 6 MB (o app já reduz para ~400 KB antes de enviar). Ficam no banco (`VARBINARY`).
- Cada registro guarda o e-mail de quem criou.
- Os 18 espaços (e os slugs oficiais) estão em `fluxo/schema.py` e em `fluxo/static/assets/js/rooms.js`. Se incluir um espaço novo, altere nos dois lugares.

## Para remover o Fluxo
Apague as 3 linhas do `app.py` e a pasta `fluxo/`. Os dados ficam nas tabelas `fluxo_*`, que podem ser apagadas com `DROP TABLE fluxo_fotos; DROP TABLE fluxo_operacoes; DROP TABLE fluxo_espacos;`.

## Testes incluídos
`python -m unittest fluxo.tests.test_api_sqlite -v` roda a API contra um SQLite em memória, sem SQL Server e sem driver ODBC. Cobre o fluxo completo, as permissões, a trava de duplicidade e a validação de fotos.

## Limitações conhecidas
- **Precisa de internet.** A versão anterior (só no navegador) funcionava offline; esta grava no servidor. Sem sinal, o operador vê "Sem conexão. Tente de novo." e nada se perde, porque o estado fica salvo no servidor. Fila offline está no roadmap.
- Não há service worker nesta versão (só o `manifest.json`, para "Adicionar à tela inicial").
- O painel carrega até 5.000 serviços e filtra no navegador. Para volumes maiores, o próximo passo é filtro e paginação no servidor.
- Fotos no banco são simples de operar, mas pesam. Se crescerem muito, o caminho natural é Azure Blob Storage (só `routes.py` muda).
- O texto de erro do Azure/Easy Auth e o comportamento do `exige_permissao` real não foram executados aqui: os testes usam um controle de acesso equivalente.
- As instruções em T-SQL (`fluxo/schema.py` e `fluxo/schema.sql`) não foram executadas em um SQL Server real nesta entrega. Rode o `schema.sql` primeiro e confira que as 3 tabelas apareceram.
