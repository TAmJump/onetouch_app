-- ワンタッチ管理 D1データベース定義
-- Cloudflare Workers KV / D1 用

-- 会社テーブル
CREATE TABLE IF NOT EXISTS companies (
  company_code TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  rep_name     TEXT,
  email        TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'free',
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL,
  updated_at   TEXT
);

-- アカウントテーブル
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  login_name    TEXT NOT NULL,
  company_code  TEXT NOT NULL REFERENCES companies(company_code),
  company_name  TEXT,
  name          TEXT NOT NULL,
  email         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',
  office_code   TEXT,
  office_name   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  is_first_login INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT
);

-- セッションテーブル
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  company_code TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_code);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- 期限切れセッションのクリーンアップ（定期実行用）
-- DELETE FROM sessions WHERE expires_at < datetime('now');
