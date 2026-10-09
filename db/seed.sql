-- LedgerLens demo data. Run after schema.sql:
--   psql "$DATABASE_URL" -f db/schema.sql -f db/seed.sql
--
-- Builds 60 customers, ~80 accounts and ~6,000 transactions spread over the
-- last 90 days, then plants ~130 anomalies of four kinds (synthetic_label =
-- TRUE). Everything is synthetic. All timestamps are generated in UTC.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT setseed(0.42);

TRUNCATE fraud_alerts, fraud_scores, model_runs, transactions, accounts, customers, staff_users
  RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------- staff ----
-- Demo sign-ins. Password for both: demo1234
INSERT INTO staff_users (email, full_name, role, password_hash) VALUES
  ('admin@ledgerlens.demo',   'Dana Whitfield', 'admin',   crypt('demo1234', gen_salt('bf', 10))),
  ('analyst@ledgerlens.demo', 'Sam Okafor',     'analyst', crypt('demo1234', gen_salt('bf', 10)));

-- ------------------------------------------------------------ customers ----
CREATE TEMP TABLE _cust ON COMMIT DROP AS
SELECT g, random() AS r1, random() AS r2, random() AS r3, random() AS r4
FROM generate_series(1, 60) AS g;

INSERT INTO customers (full_name, email, phone, home_city, home_country, password_hash, joined_at)
SELECT
  fn || ' ' || ln,
  lower(fn || '.' || ln) || g || '@example.com',
  '+1 555 01' || lpad((g % 100)::text, 2, '0'),
  city,
  'United States',
  crypt('demo1234', gen_salt('bf', 6)),
  now() - (200 + r4 * 1500) * interval '1 day'
FROM (
  SELECT g, r4,
    (ARRAY['Ava','Noah','Mia','Liam','Zoe','Ethan','Ivy','Lucas','Nora','Owen','Ruth','Caleb',
           'Elena','Marcus','Priya','Jonah','Leila','Felix','Hana','Victor'])[1 + floor(r1 * 20)::int] AS fn,
    (ARRAY['Carter','Nguyen','Bennett','Alvarez','Kim','Foster','Haddad','Reyes','Sullivan','Patel',
           'Brooks','Lindgren','Moreau','Okoye','Tanaka','Ward','Castillo','Novak','Greene','Ibarra'])[1 + floor(r2 * 20)::int] AS ln,
    (ARRAY['New York','Chicago','Houston','Phoenix','Seattle','Denver','Boston','Atlanta','Miami','Austin'])[1 + floor(r3 * 10)::int] AS city
  FROM _cust
) AS picked
ORDER BY g;

-- Demo customer sign-in: customer@ledgerlens.demo / demo1234
UPDATE customers SET email = 'customer@ledgerlens.demo' WHERE id = 1;

-- ------------------------------------------------------------- accounts ----
-- Everyone gets a checking account; about four in ten get a second account.
CREATE TEMP TABLE _acct ON COMMIT DROP AS
SELECT c.id AS customer_id, k, random() AS r_type, random() AS r_open, random() AS r_keep
FROM customers c CROSS JOIN generate_series(1, 2) AS k;

INSERT INTO accounts (account_number, customer_id, type, opened_at)
SELECT
  '40' || lpad(((row_number() OVER (ORDER BY customer_id, k) * 7368787) % 100000000)::text, 8, '0'),
  customer_id,
  CASE WHEN k = 1 THEN 'checking' WHEN r_type < 0.6 THEN 'savings' ELSE 'business' END,
  now() - (120 + r_open * 1200) * interval '1 day'
FROM _acct
WHERE k = 1 OR r_keep < 0.42
ORDER BY customer_id, k;

-- Each account gets its own spending level (mu = ln of a typical amount) and
-- activity level, so "unusual" means unusual for that account.
CREATE TEMP TABLE _profile ON COMMIT DROP AS
SELECT
  a.id AS account_id,
  a.type AS acct_type,
  c.home_city,
  c.home_country,
  ln(CASE a.type WHEN 'checking' THEN 55 WHEN 'savings' THEN 220 ELSE 520 END) + (random() - 0.5) * 0.9 AS mu,
  (CASE a.type WHEN 'checking' THEN 70 WHEN 'savings' THEN 25 ELSE 110 END * (0.6 + random() * 0.9))::int AS n_txn
FROM accounts a JOIN customers c ON c.id = a.customer_id;

CREATE TEMP TABLE _n ON COMMIT DROP AS SELECT count(*)::int AS n FROM accounts;

-- ------------------------------------------------- ordinary transactions ----
CREATE TEMP TABLE _gen ON COMMIT DROP AS
SELECT
  p.*,
  random() AS r_type, random() AS r_chan, random() AS r_day, random() AS r_hour, random() AS r_sec,
  random() AS r_city, random() AS r_dev, random() AS r_cat, random() AS r_cp,
  sqrt(-2 * ln(greatest(random(), 1e-9))) * cos(2 * pi() * random()) AS z   -- standard normal
FROM _profile p CROSS JOIN LATERAL generate_series(1, p.n_txn) AS g;

CREATE TEMP TABLE _shaped ON COMMIT DROP AS
SELECT
  g.*,
  CASE WHEN r_type < 0.55 THEN 'payment' WHEN r_type < 0.70 THEN 'withdrawal'
       WHEN r_type < 0.90 THEN 'deposit' ELSE 'transfer_out' END AS type,
  -- Mostly daytime; about 3% of ordinary activity happens between 00:00 and 06:00.
  CASE WHEN r_hour < 0.03 THEN floor(r_hour / 0.03 * 6)
       WHEN r_hour < 0.30 THEN 6 + floor((r_hour - 0.03) / 0.27 * 6)
       WHEN r_hour < 0.78 THEN 12 + floor((r_hour - 0.30) / 0.48 * 7)
       ELSE 19 + floor((r_hour - 0.78) / 0.22 * 5) END::int AS hour,
  (ARRAY['New York','Chicago','Houston','Phoenix','Seattle','Denver','Boston','Atlanta','Miami','Austin'])[1 + floor(r_dev * 10)::int] AS other_city,
  (ARRAY['groceries','dining','fuel','utilities','travel','electronics','health','entertainment'])[1 + floor(r_cat * 8)::int] AS category
FROM _gen g;

INSERT INTO transactions
  (reference, account_id, type, amount, channel, merchant_category, counterparty_account_id,
   city, country, device_id, description, created_at)
SELECT
  'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  account_id,
  type,
  CASE type
    WHEN 'payment'    THEN greatest(1.5, round(exp(mu + 0.70 * z)::numeric, 2))
    WHEN 'withdrawal' THEN greatest(20, round(exp(mu + 0.5 + 0.45 * z)::numeric / 20) * 20)
    WHEN 'deposit'    THEN greatest(10, round(exp(mu + 1.5 + 0.50 * z)::numeric, 2))
    ELSE                   greatest(5, round(exp(mu + 0.9 + 0.60 * z)::numeric, 2))
  END,
  channel,
  CASE WHEN type = 'payment' THEN category END,
  CASE WHEN type = 'transfer_out'
       THEN ((account_id - 1 + 1 + floor(r_cp * ((SELECT n FROM _n) - 1))::int) % (SELECT n FROM _n)) + 1 END,
  CASE WHEN r_city < 0.95 THEN home_city ELSE other_city END,
  home_country,
  CASE WHEN channel IN ('online', 'mobile')
       THEN 'dev-' || account_id || CASE WHEN r_dev < 0.88 THEN '-a' ELSE '-b' END END,
  CASE type
    WHEN 'payment'    THEN initcap(category) || ' purchase'
    WHEN 'withdrawal' THEN 'Cash withdrawal'
    WHEN 'deposit'    THEN CASE WHEN z > 0.8 THEN 'Payroll deposit' ELSE 'Deposit' END
    ELSE 'Transfer to another account'
  END,
  date_trunc('day', now()) - (1 + floor(r_day * 90)) * interval '1 day'
    + hour * interval '1 hour' + floor(r_sec * 3600) * interval '1 second'
FROM (
  SELECT s.*,
    CASE type
      WHEN 'payment'    THEN CASE WHEN r_chan < 0.50 THEN 'pos' WHEN r_chan < 0.80 THEN 'online' ELSE 'mobile' END
      WHEN 'withdrawal' THEN CASE WHEN r_chan < 0.80 THEN 'atm' ELSE 'branch' END
      WHEN 'deposit'    THEN CASE WHEN r_chan < 0.50 THEN 'mobile' WHEN r_chan < 0.80 THEN 'branch' ELSE 'atm' END
      ELSE                   CASE WHEN r_chan < 0.60 THEN 'mobile' ELSE 'online' END
    END AS channel
  FROM _shaped s
) AS s;

-- --------------------------------------------------- planted anomalies ----
-- A. One very large outgoing wire (15-60x the account's typical amount).
INSERT INTO transactions
  (reference, account_id, type, amount, channel, city, country, device_id, description, created_at, synthetic_label)
SELECT
  'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  p.account_id, 'transfer_out',
  round((exp(p.mu) * (15 + r.r_amt * 45))::numeric, 2),
  'online', p.home_city, p.home_country, 'dev-' || p.account_id || '-a',
  'Wire transfer to external account',
  date_trunc('day', now()) - (1 + floor(r.r_day * 90)) * interval '1 day' + (9 + floor(r.r_hour * 10)) * interval '1 hour'
    + floor(r.r_sec * 3600) * interval '1 second',
  TRUE
FROM (
  SELECT (1 + floor(random() * (SELECT n FROM _n)))::int AS account_id,
         random() AS r_amt, random() AS r_day, random() AS r_hour, random() AS r_sec
  FROM generate_series(1, 40)
) AS r JOIN _profile p USING (account_id);

-- B. Night-time cash-out: five ATM withdrawals within minutes, away from home.
INSERT INTO transactions
  (reference, account_id, type, amount, channel, city, country, description, created_at, synthetic_label)
SELECT
  'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  p.account_id, 'withdrawal',
  (ARRAY[200, 300, 400, 500])[1 + ((k + r.pick) % 4)],
  'atm',
  CASE WHEN r.away_city = p.home_city THEN 'Las Vegas' ELSE r.away_city END,
  p.home_country,
  'Cash withdrawal',
  date_trunc('day', now()) - (1 + floor(r.r_day * 90)) * interval '1 day' + (1 + floor(r.r_hour * 4)) * interval '1 hour'
    + floor(r.r_sec * 2400) * interval '1 second' + k * interval '150 seconds',
  TRUE
FROM (
  SELECT (1 + floor(random() * (SELECT n FROM _n)))::int AS account_id,
         floor(random() * 4)::int AS pick, random() AS r_day, random() AS r_hour, random() AS r_sec,
         (ARRAY['New York','Chicago','Houston','Phoenix','Seattle','Denver','Boston','Atlanta','Miami','Austin'])[1 + floor(random() * 10)::int] AS away_city
  FROM generate_series(1, 10)
) AS r
JOIN _profile p USING (account_id)
CROSS JOIN generate_series(0, 4) AS k;

-- C. Card-not-present purchase from abroad on a device never seen before.
INSERT INTO transactions
  (reference, account_id, type, amount, channel, merchant_category, city, country, device_id, description, created_at, synthetic_label)
SELECT
  'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  p.account_id, 'payment',
  round((exp(p.mu) * (5 + r.r_amt * 10))::numeric, 2),
  'online',
  CASE WHEN r.r_amt < 0.5 THEN 'electronics' ELSE 'travel' END,
  split_part(r.place, '|', 1), split_part(r.place, '|', 2),
  'dev-' || p.account_id || '-x' || r.i,
  CASE WHEN r.r_amt < 0.5 THEN 'Electronics purchase' ELSE 'Travel purchase' END,
  date_trunc('day', now()) - (1 + floor(r.r_day * 90)) * interval '1 day' + floor(r.r_hour * 24) * interval '1 hour'
    + floor(r.r_sec * 3600) * interval '1 second',
  TRUE
FROM (
  SELECT i, (1 + floor(random() * (SELECT n FROM _n)))::int AS account_id,
         random() AS r_amt, random() AS r_day, random() AS r_hour, random() AS r_sec,
         (ARRAY['Reykjavik|Iceland','Lisbon|Portugal','Singapore|Singapore','Auckland|New Zealand',
                'Montevideo|Uruguay','Tallinn|Estonia'])[1 + floor(random() * 6)::int] AS place
  FROM generate_series(1, 25) AS i
) AS r JOIN _profile p USING (account_id);

-- D. Quiet account takeover: new device, small hours, a moderately large
--    transfer from the usual city. Deliberately subtle - the model will miss some.
INSERT INTO transactions
  (reference, account_id, type, amount, channel, city, country, device_id, description, created_at, synthetic_label)
SELECT
  'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  p.account_id, 'transfer_out',
  round((exp(p.mu) * (3 + r.r_amt * 4))::numeric, 2),
  'mobile', p.home_city, p.home_country,
  'dev-' || p.account_id || '-y' || r.i,
  'Transfer to external account',
  date_trunc('day', now()) - (1 + floor(r.r_day * 90)) * interval '1 day' + floor(r.r_hour * 5) * interval '1 hour'
    + floor(r.r_sec * 3600) * interval '1 second',
  TRUE
FROM (
  SELECT i, (1 + floor(random() * (SELECT n FROM _n)))::int AS account_id,
         random() AS r_amt, random() AS r_day, random() AS r_hour, random() AS r_sec
  FROM generate_series(1, 15) AS i
) AS r JOIN _profile p USING (account_id);

-- ------------------------------------------- receiving side of transfers ----
INSERT INTO transactions
  (reference, account_id, type, amount, channel, counterparty_account_id, city, country, description, created_at)
SELECT t.reference, t.counterparty_account_id, 'transfer_in', t.amount, t.channel, t.account_id,
       c.home_city, c.home_country, 'Transfer from another account', t.created_at
FROM transactions t
JOIN accounts a ON a.id = t.counterparty_account_id
JOIN customers c ON c.id = a.customer_id
WHERE t.type = 'transfer_out' AND t.counterparty_account_id IS NOT NULL;

-- -------------------------------------------------------------- balances ----
-- Opening balance is whatever keeps the account solvent, plus a cushion.
UPDATE accounts a
SET balance = round((greatest(0, -m.net) + 800 + random() * 24000)::numeric, 2) + m.net
FROM (
  SELECT account_id,
         sum(CASE WHEN type IN ('deposit', 'transfer_in') THEN amount ELSE -amount END) AS net
  FROM transactions GROUP BY account_id
) AS m
WHERE m.account_id = a.id;

COMMIT;
ANALYZE customers;
ANALYZE accounts;
ANALYZE transactions;

SELECT
  (SELECT count(*) FROM customers)                                 AS customers,
  (SELECT count(*) FROM accounts)                                  AS accounts,
  (SELECT count(*) FROM transactions)                              AS transactions,
  (SELECT count(*) FROM transactions WHERE synthetic_label)        AS planted_anomalies;
