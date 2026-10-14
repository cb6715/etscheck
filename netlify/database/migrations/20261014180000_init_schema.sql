CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE wage_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  hourly_rate DOUBLE PRECISION NOT NULL DEFAULT 150,
  overtime_threshold_hours DOUBLE PRECISION NOT NULL DEFAULT 37,
  overtime_bonus_pct DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  night_supplement DOUBLE PRECISION NOT NULL DEFAULT 25,
  night_start_hour INTEGER NOT NULL DEFAULT 17,
  night_end_hour INTEGER NOT NULL DEFAULT 5,
  break_start_minutes INTEGER NOT NULL DEFAULT 720,
  break_end_minutes INTEGER NOT NULL DEFAULT 750,
  monthly_tax_deduction DOUBLE PRECISION NOT NULL DEFAULT 5100,
  am_bidrag_pct DOUBLE PRECISION NOT NULL DEFAULT 0.08,
  tax_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0.44,
  atp_rate_per_hour DOUBLE PRECISION NOT NULL DEFAULT 0.6822,
  sick_pay_hourly_rate DOUBLE PRECISION NOT NULL DEFAULT 132,
  advance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  pay_period_start DATE NOT NULL DEFAULT date_trunc('month', now()),
  pay_period_end DATE NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month' - interval '1 day'),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE work_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  check_in_at TIMESTAMP NOT NULL,
  check_out_at TIMESTAMP,
  paid_seconds INTEGER,
  gross_amount DOUBLE PRECISION,
  net_amount DOUBLE PRECISION,
  is_sick_day BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX work_sessions_user_checkin_idx ON work_sessions (user_id, check_in_at);
