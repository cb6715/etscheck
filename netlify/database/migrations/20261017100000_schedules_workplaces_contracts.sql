-- Adds the schema for the "komplet videreudvikling" features: monthly
-- shift planning, workplace/geolocation check-in, and contract upload.
-- Purely additive — every statement either creates a new table or adds a
-- nullable/defaulted column, so no existing user or row is touched.

-- 'daily' (today's check-in/out flow, unchanged default) or 'monthly'
-- (plan a full month of shifts up front, see schedule_templates below).
-- Stored per-user, not globally, since different people may prefer either.
ALTER TABLE wage_settings ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'daily';

-- A physical place the user works, used for the (foreground-only, see
-- src/lib/geolocation.ts) "you're near <workplace>" check-in reminder.
-- lat/lng are captured directly from the browser's Geolocation API when the
-- user saves the workplace (standing there, or dropping a pin) rather than
-- geocoded from a typed address — no geocoding API is configured in this
-- app's environment, and this avoids silently faking one.
CREATE TABLE IF NOT EXISTS workplaces (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_meters INTEGER NOT NULL DEFAULT 150,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workplaces_user_idx ON workplaces (user_id);

-- Uploaded ansættelseskontrakt metadata. The file bytes themselves live in
-- a private Netlify Blobs store (key = blob_key below), never under a
-- public URL — this table only ever holds metadata plus whatever structured
-- fields were extracted/confirmed, never the raw file content.
--
-- extraction_status: 'ai_unavailable' is the only status this app can ever
-- set itself today, since no AI/LLM API key is configured anywhere in this
-- environment (checked in src/lib/contracts.ts) — real automatic field
-- extraction from the uploaded PDF/image is NOT implemented, so uploading a
-- contract always routes straight to the manual-entry fallback form rather
-- than pretending to have read it. 'extracted' is reserved for if/when an
-- API key is configured later.
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  blob_key TEXT NOT NULL UNIQUE,
  extraction_status TEXT NOT NULL DEFAULT 'ai_unavailable',
  extracted_fields JSONB,
  confirmed_fields JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contracts_user_idx ON contracts (user_id);

-- A reusable weekly pattern ("normal uge") the monthly planner can stamp
-- across a calendar month in one go, then the individual days can be
-- edited/overridden without touching the template.
CREATE TABLE IF NOT EXISTS schedule_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Standard uge',
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_template_days (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES schedule_templates(id) ON DELETE CASCADE,
  -- 0 = Sunday .. 6 = Saturday, matching copenhagenWeekday()'s convention.
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minutes INTEGER,
  end_minutes INTEGER,
  workplace_id INTEGER REFERENCES workplaces(id) ON DELETE SET NULL,
  UNIQUE (template_id, weekday)
);

-- One row per planned calendar day. Generated in bulk from a template when
-- planning a month ("kopier til måned"), then each day is freely editable
-- in place (change hours, mark off/sick/extra-vagt) without affecting the
-- template or any other day. The dashboard reads this for "næste planlagte
-- vagt" and "mangler du at registrere i dag?" warnings; it's a PLAN, not an
-- actual worked shift — actual hours still come from work_sessions via
-- check-in/check-out, same as the daily-tracking flow.
CREATE TABLE IF NOT EXISTS scheduled_shifts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_minutes INTEGER,
  end_minutes INTEGER,
  workplace_id INTEGER REFERENCES workplaces(id) ON DELETE SET NULL,
  -- 'planned' (normal planlagt vagt) | 'off' (fri) | 'sick' (sygedag) | 'extra' (ekstravagt)
  status TEXT NOT NULL DEFAULT 'planned',
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (user_id, shift_date)
);

CREATE INDEX IF NOT EXISTS scheduled_shifts_user_date_idx ON scheduled_shifts (user_id, shift_date);
