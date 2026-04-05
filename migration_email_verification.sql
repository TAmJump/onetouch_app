-- ============================================================
-- メール認証テーブル
-- 実行: psql -U postgres -d onetouch_db -f migration_email_verification.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS email_verifications (
    id          SERIAL PRIMARY KEY,
    token       VARCHAR(80)  UNIQUE NOT NULL,          -- 認証トークン（64文字ランダム）
    email       VARCHAR(255) NOT NULL,                  -- 登録メールアドレス
    pending_data JSONB        NOT NULL,                 -- 会社・管理者データ（仮登録）
    expires_at  TIMESTAMP    NOT NULL,                  -- 有効期限（発行から24時間）
    used_at     TIMESTAMP    DEFAULT NULL,              -- 使用済み日時（NULL=未使用）
    ip_address  VARCHAR(45)  DEFAULT NULL,              -- 登録時のIPアドレス
    created_at  TIMESTAMP    DEFAULT NOW()
);

-- インデックス（検索高速化）
CREATE INDEX IF NOT EXISTS idx_ev_token      ON email_verifications (token);
CREATE INDEX IF NOT EXISTS idx_ev_email      ON email_verifications (email);
CREATE INDEX IF NOT EXISTS idx_ev_expires_at ON email_verifications (expires_at);

-- 期限切れレコードの自動削除（7日後）
-- ※ pg_cron を使う場合は以下を有効化
-- SELECT cron.schedule('cleanup-verifications', '0 3 * * *',
--   'DELETE FROM email_verifications WHERE expires_at < NOW() - INTERVAL ''7 days''');

COMMENT ON TABLE  email_verifications              IS '会社登録メール認証の仮データ';
COMMENT ON COLUMN email_verifications.token        IS 'URLに含める認証トークン';
COMMENT ON COLUMN email_verifications.pending_data IS 'companies・accountsに保存する前のJSONデータ';
COMMENT ON COLUMN email_verifications.used_at      IS 'NULL=未使用 / NOT NULL=使用済み（再利用不可）';
