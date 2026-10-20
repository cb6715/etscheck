-- Snapshots a pay period's final numbers the moment it's closed, so the
-- dashboard can show "sidste periode: X kr, udbetales d. Y" reliably —
-- wage_settings only ever holds the CURRENT period's start/end, so once
-- closePayPeriod() advances it, the previous period's boundaries and
-- totals would otherwise be unrecoverable (work_sessions rows are still
-- there, but nothing records where the OLD period started/ended).
CREATE TABLE IF NOT EXISTS pay_period_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_amount DOUBLE PRECISION NOT NULL,
  net_amount DOUBLE PRECISION NOT NULL,
  advance_amount DOUBLE PRECISION NOT NULL,
  closed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pay_period_history_user_idx ON pay_period_history (user_id, period_end DESC);
