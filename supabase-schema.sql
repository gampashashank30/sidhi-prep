-- ============================================================
-- Siddhi Prep — Authentication Database Schema
-- Run this in the Supabase Dashboard SQL Editor
-- (Database → SQL Editor → New Query → Paste → Run)
-- ============================================================

-- ── Enable UUID generation ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role   NOT NULL DEFAULT 'user',
  status        user_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lowercase email index for case-insensitive lookups
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));

-- ── Sessions ──────────────────────────────────────────────────────────────────
-- Database-backed sessions allow individual/bulk revocation on logout or disable.
CREATE TABLE IF NOT EXISTS sessions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

-- ── Password reset / invitation tokens ────────────────────────────────────────
-- Raw tokens are NEVER stored here — only SHA-256 hashes.
-- This table handles both password-reset and first-time invite/setup tokens.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,         -- NULL = unused. Set when consumed.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prt_user_id_idx    ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS prt_token_hash_idx ON password_reset_tokens(token_hash);

-- ── Auto-update updated_at on users ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Row-Level Security (RLS) ──────────────────────────────────────────────────
-- We use the Supabase SERVICE ROLE key from the server — RLS is bypassed for it.
-- Enable RLS to deny any direct anon/user client access to these tables.
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- No policies → service role bypass only. All access from application code only.

-- ── Cleanup: Automatically delete expired sessions (optional, can also be a cron) ──
-- Supabase does not run PostgreSQL cron jobs by default, but you can add a
-- pg_cron extension job if needed:
-- SELECT cron.schedule('delete-expired-sessions', '0 3 * * *',
--   $$DELETE FROM sessions WHERE expires_at < NOW()$$);
