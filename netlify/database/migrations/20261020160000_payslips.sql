-- Uploaded lønsedler ("payslips") — same storage pattern as contracts
-- (file bytes in a private Netlify Blobs store, never a public URL, never
-- the DB itself). Unlike contracts, extraction here IS genuinely
-- implemented (see src/lib/payslips.ts) via the Netlify AI Gateway, which
-- injects real provider credentials at runtime without needing an
-- API key configured in this app's own env vars.
CREATE TABLE IF NOT EXISTS payslips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  blob_key TEXT NOT NULL UNIQUE,
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  extracted_fields JSONB,
  confirmed_fields JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payslips_user_idx ON payslips (user_id);
