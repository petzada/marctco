-- Contatos do formulário do site (POST /api/leads). Aplicado pelo job Deploy do CI.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  empresa TEXT NOT NULL,
  ramo TEXT NOT NULL,
  produto TEXT NOT NULL,
  -- Seção do site em que o botão foi clicado (hero, gmb, lp, social, ads, ai, contact)
  origem TEXT NOT NULL DEFAULT 'site'
);

CREATE INDEX IF NOT EXISTS leads_created_at ON leads (created_at DESC);
