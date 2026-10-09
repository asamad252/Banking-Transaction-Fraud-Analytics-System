-- LedgerLens: banking transaction & fraud analytics
-- PostgreSQL 13+ schema. Safe to re-run: it drops and recreates everything.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP VIEW IF EXISTS v_transactions_enriched;
DROP TABLE IF EXISTS fraud_alerts, fraud_scores, model_runs, transactions, accounts, customers, staff_users CASCADE;

-- People who sign in to the console (bank staff, not bank customers).
CREATE TABLE staff_users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'analyst')),
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id           SERIAL PRIMARY KEY,
  full_name    TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT,
  home_city    TEXT NOT NULL,
  home_country TEXT NOT NULL,
  password_hash TEXT,            -- lets the customer sign in to their own accounts
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id             SERIAL PRIMARY KEY,
  account_number TEXT NOT NULL UNIQUE,
  customer_id    INTEGER NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  type           TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'business')),
  currency       CHAR(3) NOT NULL DEFAULT 'USD',
  balance        NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX accounts_customer_idx ON accounts (customer_id);

-- One row per ledger movement on one account. A transfer writes two rows
-- (transfer_out on the sender, transfer_in on the receiver) that point at
-- each other through counterparty_account_id and share a reference.
CREATE TABLE transactions (
  id                      BIGSERIAL PRIMARY KEY,
  reference               TEXT NOT NULL,
  account_id              INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  type                    TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'payment', 'transfer_in', 'transfer_out')),
  amount                  NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  channel                 TEXT NOT NULL CHECK (channel IN ('branch', 'atm', 'online', 'mobile', 'pos')),
  merchant_category       TEXT,
  counterparty_account_id INTEGER REFERENCES accounts (id),
  city                    TEXT NOT NULL,
  country                 TEXT NOT NULL,
  device_id               TEXT,
  description             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- TRUE only for anomalies planted by db/seed.sql. It exists so the model can
  -- be graded against known answers; it is never used as a model feature.
  synthetic_label         BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX transactions_account_time_idx ON transactions (account_id, created_at DESC);
CREATE INDEX transactions_time_idx ON transactions (created_at DESC);
CREATE INDEX transactions_reference_idx ON transactions (reference);

-- One row per Isolation Forest training run.
CREATE TABLE model_runs (
  id            SERIAL PRIMARY KEY,
  algorithm     TEXT NOT NULL DEFAULT 'isolation_forest',
  params        JSONB NOT NULL DEFAULT '{}',
  features      JSONB NOT NULL DEFAULT '[]',
  trained_rows  INTEGER NOT NULL,
  flagged_rows  INTEGER NOT NULL,
  threshold     REAL NOT NULL,
  metrics       JSONB NOT NULL DEFAULT '{}',
  triggered_by  INTEGER REFERENCES staff_users (id),
  trained_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Latest score for each transaction (0 = ordinary, 1 = most unusual).
CREATE TABLE fraud_scores (
  transaction_id BIGINT PRIMARY KEY REFERENCES transactions (id) ON DELETE CASCADE,
  model_run_id   INTEGER REFERENCES model_runs (id) ON DELETE SET NULL,
  anomaly_score  REAL NOT NULL CHECK (anomaly_score BETWEEN 0 AND 1),
  is_anomaly     BOOLEAN NOT NULL,
  reasons        JSONB NOT NULL DEFAULT '[]',
  scored_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fraud_scores_anomaly_idx ON fraud_scores (is_anomaly) WHERE is_anomaly;

-- Review queue: one alert per flagged transaction.
CREATE TABLE fraud_alerts (
  id              SERIAL PRIMARY KEY,
  transaction_id  BIGINT NOT NULL UNIQUE REFERENCES transactions (id) ON DELETE CASCADE,
  severity        TEXT NOT NULL CHECK (severity IN ('medium', 'high', 'critical')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'dismissed')),
  resolved_by     INTEGER REFERENCES staff_users (id),
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX fraud_alerts_status_idx ON fraud_alerts (status);

-- Flat, analysis-ready view. The API reads it, and it is also the table to
-- point a BI tool (Power BI, Metabase, ...) at.
CREATE VIEW v_transactions_enriched AS
SELECT
  t.id,
  t.reference,
  t.created_at,
  t.type,
  t.amount,
  CASE WHEN t.type IN ('deposit', 'transfer_in') THEN t.amount ELSE -t.amount END AS signed_amount,
  t.channel,
  t.merchant_category,
  t.city,
  t.country,
  t.device_id,
  t.description,
  t.synthetic_label,
  t.counterparty_account_id,
  a.id             AS account_id,
  a.account_number,
  a.type           AS account_type,
  a.status         AS account_status,
  c.id             AS customer_id,
  c.full_name      AS customer_name,
  c.home_city,
  c.home_country,
  s.anomaly_score,
  COALESCE(s.is_anomaly, FALSE) AS is_anomaly,
  COALESCE(s.reasons, '[]'::jsonb) AS reasons,
  (s.transaction_id IS NOT NULL) AS is_scored,
  al.id            AS alert_id,
  al.status        AS alert_status,
  al.severity      AS alert_severity
FROM transactions t
JOIN accounts a ON a.id = t.account_id
JOIN customers c ON c.id = a.customer_id
LEFT JOIN fraud_scores s ON s.transaction_id = t.id
LEFT JOIN fraud_alerts al ON al.transaction_id = t.id;
