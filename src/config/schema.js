const { query } = require("./database");

async function runSchema() {
  // Users table
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT        NOT NULL,
      email      TEXT        NOT NULL UNIQUE,
      password   TEXT        NOT NULL,
      role       TEXT        NOT NULL DEFAULT 'viewer'
                             CHECK (role IN ('viewer', 'analyst', 'admin')),
      status     TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'inactive')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Transactions table
  await query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id          SERIAL PRIMARY KEY,
      amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      type        TEXT           NOT NULL CHECK (type IN ('income', 'expense')),
      category    TEXT           NOT NULL,
      date        DATE           NOT NULL,
      notes       TEXT,
      created_by  INTEGER        NOT NULL REFERENCES users(id),
      deleted_at  TIMESTAMPTZ    DEFAULT NULL,
      created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
    );
  `);

  console.log("✅ Database schema ready");
}

module.exports = { runSchema };
