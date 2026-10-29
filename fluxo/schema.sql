-- Fluxo: tabelas e espaços iniciais (idempotente)

IF OBJECT_ID('fluxo_espacos', 'U') IS NULL
CREATE TABLE fluxo_espacos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    slug NVARCHAR(80) NOT NULL UNIQUE,
    nome NVARCHAR(120) NOT NULL,
    ativo BIT NOT NULL DEFAULT 1,
    ordem INT NOT NULL DEFAULT 0
)
GO

IF OBJECT_ID('fluxo_operacoes', 'U') IS NULL
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
)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_fluxo_operacao_aberta')
CREATE UNIQUE INDEX UX_fluxo_operacao_aberta ON fluxo_operacoes (espaco_id) WHERE status = 'em_andamento'
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fluxo_operacoes_inicio')
CREATE INDEX IX_fluxo_operacoes_inicio ON fluxo_operacoes (inicio_em DESC)
GO

IF OBJECT_ID('fluxo_fotos', 'U') IS NULL
CREATE TABLE fluxo_fotos (
    id NVARCHAR(36) NOT NULL PRIMARY KEY,
    operacao_id NVARCHAR(36) NOT NULL REFERENCES fluxo_operacoes(id),
    tipo NVARCHAR(20) NOT NULL,
    mime NVARCHAR(50) NOT NULL,
    tamanho INT NOT NULL,
    conteudo VARBINARY(MAX) NOT NULL,
    criado_por NVARCHAR(200) NULL,
    criado_em DATETIME2 NOT NULL
)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fluxo_fotos_operacao')
CREATE INDEX IX_fluxo_fotos_operacao ON fluxo_fotos (operacao_id)
GO

IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'espaco-convivencia') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('espaco-convivencia', N'Espaço de Convivência', 0);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-curitiba') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-curitiba', N'Sala Curitiba', 1);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-cascavel') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-cascavel', N'Sala Cascavel', 2);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-parana') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-parana', N'Sala Paraná', 3);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-maringa') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-maringa', N'Sala Maringá', 4);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'espaco-araucaria') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('espaco-araucaria', N'Espaço Araucária', 5);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-londrina') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-londrina', N'Sala Londrina', 6);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-guarapuava') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-guarapuava', N'Sala Guarapuava', 7);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-ponta-grossa') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-ponta-grossa', N'Sala Ponta Grossa', 8);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-francisco-beltrao') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-francisco-beltrao', N'Sala Francisco Beltrão', 9);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-toledo') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-toledo', N'Sala Toledo', 10);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'sala-apucarana') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('sala-apucarana', N'Sala Apucarana', 11);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'auditorio-mario-de-mari') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('auditorio-mario-de-mari', N'Auditório Mario De Mari', 12);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'auditorio-caio-amaral') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('auditorio-caio-amaral', N'Auditório Caio Amaral', 13);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'atrio-i') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('atrio-i', N'Átrio I', 14);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'atrio-ii') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('atrio-ii', N'Átrio II', 15);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'atrio-iii') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('atrio-iii', N'Átrio III', 16);
IF NOT EXISTS (SELECT 1 FROM fluxo_espacos WHERE slug = 'outros') INSERT INTO fluxo_espacos (slug, nome, ordem) VALUES ('outros', N'Outros', 17);
GO
