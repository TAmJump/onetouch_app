/**
 * auth.js — 会社登録・メール認証 APIルーター
 *
 * 使い方:
 *   const authRouter = require('./routes/auth');
 *   app.use('/api/auth', authRouter);
 *
 * 環境変数（.env）:
 *   AWS_REGION          = ap-northeast-1
 *   AWS_ACCESS_KEY_ID   = AKIAxxxxxxxxxx
 *   AWS_SECRET_ACCESS_KEY = xxxxxxxxxxxxxxxx
 *   SES_FROM_EMAIL      = noreply@onetouch.tamjump.com
 *   APP_URL             = https://onetouch.tamjump.com
 *   DATABASE_URL        = postgresql://user:pass@localhost:5432/onetouch_db
 *
 * インストール:
 *   npm install @aws-sdk/client-ses crypto express pg
 */

const express  = require('express');
const crypto   = require('crypto');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

const router = express.Router();

// ===== DB接続プール =====
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ===== Amazon SES クライアント =====
const ses = new SESClient({
  region: process.env.AWS_REGION || 'ap-northeast-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ===== メールテンプレート読み込み =====
const EMAIL_TEMPLATE_PATH = path.join(__dirname, '../emails/verification-email.html');
let emailTemplate = '';
try {
  emailTemplate = fs.readFileSync(EMAIL_TEMPLATE_PATH, 'utf8');
} catch (e) {
  console.error('[auth] メールテンプレート読み込み失敗:', e.message);
}

function buildEmailHtml(vars) {
  let html = emailTemplate;
  Object.entries(vars).forEach(([key, val]) => {
    html = html.replaceAll(`{{${key}}}`, val);
  });
  return html;
}

// ===== ユーティリティ =====
function generateToken() {
  return crypto.randomBytes(32).toString('hex'); // 64文字16進数
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateCompanyCode(code) {
  return /^[A-Z0-9]{2,4}$/.test(code);
}

// ===== レート制限（簡易・メモリ）=====
// 本番はRedisを推奨。同一IPから5分間に3回まで。
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip;
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }
  const times = rateLimitMap.get(key).filter(t => now - t < 5 * 60 * 1000);
  if (times.length >= 3) return false;
  times.push(now);
  rateLimitMap.set(key, times);
  return true;
}

// ============================================================
// POST /api/auth/register
// 仮登録 → メール送信
// ============================================================
router.post('/register', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  // レート制限チェック
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'しばらく待ってから再試行してください（5分間に3回まで）' });
  }

  const {
    companyName, companyCode, repName, email, plan,
    adminName, adminLogin, adminPassword
  } = req.body;

  // ===== バリデーション =====
  if (!companyName?.trim())             return res.status(400).json({ error: '会社名を入力してください' });
  if (!validateCompanyCode(companyCode)) return res.status(400).json({ error: '会社コードは2〜4文字の半角英大文字・数字で入力してください' });
  if (!validateEmail(email))             return res.status(400).json({ error: 'メールアドレスを正しく入力してください' });
  if (!adminName?.trim())               return res.status(400).json({ error: '管理者名を入力してください' });
  if (!/^[a-zA-Z0-9._-]+$/.test(adminLogin)) return res.status(400).json({ error: 'ログイン名は半角英数字・ドット・ハイフン・アンダーバーのみです' });
  if (!adminPassword || adminPassword.length < 8) return res.status(400).json({ error: 'パスワードは8文字以上で設定してください' });
  if (!/[a-zA-Z]/.test(adminPassword)) return res.status(400).json({ error: 'パスワードに英字を含めてください' });
  if (!/[0-9]/.test(adminPassword))    return res.status(400).json({ error: 'パスワードに数字を含めてください' });

  const code = companyCode.toUpperCase().trim();
  const loginId = `${code}-${adminLogin.trim()}`;

  try {
    // ===== 会社コード重複チェック（DB） =====
    const dup = await pool.query(
      'SELECT id FROM companies WHERE company_code = $1',
      [code]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'この会社コードはすでに使われています。別のコードを選んでください。' });
    }

    // ===== 同メールの未使用トークンが存在すれば削除（再送対応） =====
    await pool.query(
      'DELETE FROM email_verifications WHERE email = $1 AND used_at IS NULL',
      [email]
    );

    // ===== トークン生成・DB保存 =====
    const token     = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24時間後

    // パスワードはハッシュ化して保存（bcryptを使う場合）
    // const bcrypt = require('bcrypt');
    // const hashedPassword = await bcrypt.hash(adminPassword, 12);
    // 現状はフロントと合わせてそのまま保存（移行時にハッシュ化推奨）
    const pendingData = {
      company: {
        companyCode:  code,
        companyName:  companyName.trim(),
        repName:      repName?.trim() || '',
        email:        email.trim(),
        plan:         ['free', 'pro'].includes(plan) ? plan : 'free',
        status:       'active',
        createdAt:    new Date().toISOString(),
      },
      admin: {
        loginId:      loginId,
        loginName:    adminLogin.trim(),
        companyCode:  code,
        companyName:  companyName.trim(),
        name:         adminName.trim(),
        email:        email.trim(),
        password:     adminPassword, // TODO: bcryptハッシュ化
        role:         'company_admin',
        officeCode:   `${code}-H001`,
        officeName:   '本社',
        status:       'active',
        isFirstLogin: true,
        plan:         ['free', 'pro'].includes(plan) ? plan : 'free',
      }
    };

    await pool.query(
      `INSERT INTO email_verifications (token, email, pending_data, expires_at, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, email.trim(), JSON.stringify(pendingData), expiresAt, ip]
    );

    // ===== 認証URL =====
    const verifyUrl = `${process.env.APP_URL}/api/auth/verify?token=${token}`;

    // ===== Amazon SES でメール送信 =====
    const htmlBody = buildEmailHtml({
      company_name:  companyName.trim(),
      admin_name:    adminName.trim(),
      email:         email.trim(),
      verify_url:    verifyUrl,
      expire_hours:  '24',
    });

    await ses.send(new SendEmailCommand({
      Source: `ワンタッチ管理 <${process.env.SES_FROM_EMAIL}>`,
      Destination: { ToAddresses: [email.trim()] },
      Message: {
        Subject: {
          Data:    '【ワンタッチ管理】メールアドレスの確認',
          Charset: 'UTF-8',
        },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: {
            Data: `ワンタッチ管理システムへの登録確認\n\n以下のURLをクリックして登録を完了してください。\n${verifyUrl}\n\n有効期限: 24時間`,
            Charset: 'UTF-8',
          },
        },
      },
    }));

    return res.json({ ok: true, message: '確認メールを送信しました' });

  } catch (err) {
    console.error('[auth/register] エラー:', err);
    return res.status(500).json({ error: 'サーバーエラーが発生しました。しばらく待ってから再試行してください。' });
  }
});

// ============================================================
// GET /api/auth/verify?token=xxxx
// 認証完了 → 本登録・リダイレクト
// ============================================================
router.get('/verify', async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string' || token.length < 60) {
    return res.redirect(`${process.env.APP_URL}/register.html?result=invalid`);
  }

  try {
    // ===== トークン照合 =====
    const result = await pool.query(
      'SELECT * FROM email_verifications WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.redirect(`${process.env.APP_URL}/register.html?result=invalid`);
    }

    const row = result.rows[0];

    // 使用済みチェック
    if (row.used_at) {
      return res.redirect(`${process.env.APP_URL}/register.html?result=used`);
    }

    // 有効期限チェック
    if (new Date() > new Date(row.expires_at)) {
      return res.redirect(`${process.env.APP_URL}/register.html?result=expired`);
    }

    const data = row.pending_data;

    // ===== 会社コード最終確認 =====
    const dup = await pool.query(
      'SELECT id FROM companies WHERE company_code = $1',
      [data.company.companyCode]
    );
    if (dup.rows.length > 0) {
      await pool.query('UPDATE email_verifications SET used_at = NOW() WHERE token = $1', [token]);
      return res.redirect(`${process.env.APP_URL}/register.html?result=duplicate`);
    }

    // ===== 本登録（トランザクション） =====
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // companies テーブルに登録
      const companyResult = await client.query(
        `INSERT INTO companies
           (company_code, name, rep_name, email, plan, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          data.company.companyCode,
          data.company.companyName,
          data.company.repName,
          data.company.email,
          data.company.plan,
          'active',
          data.company.createdAt,
        ]
      );
      const companyId = companyResult.rows[0].id;

      // デフォルト事業所（本社）を作成
      const officeResult = await client.query(
        `INSERT INTO offices
           (company_id, office_code, name, status, created_at)
         VALUES ($1, $2, $3, 'active', NOW())
         RETURNING id`,
        [companyId, data.admin.officeCode, data.admin.officeName]
      );
      const officeId = officeResult.rows[0].id;

      // users テーブルに管理者アカウントを登録
      await client.query(
        `INSERT INTO users
           (login_id, login_name, company_id, office_id, name, email, password, role, status, is_first_login, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'company_admin', 'active', true, NOW())`,
        [
          data.admin.loginId,
          data.admin.loginName,
          companyId,
          officeId,
          data.admin.name,
          data.admin.email,
          data.admin.password,
        ]
      );

      // email_verifications を使用済みに更新
      await client.query(
        'UPDATE email_verifications SET used_at = NOW() WHERE token = $1',
        [token]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // ===== セッション発行（express-sessionを使う場合） =====
    if (req.session) {
      req.session.userId   = data.admin.loginId;
      req.session.role     = 'company_admin';
      req.session.companyCode = data.company.companyCode;
    }

    // ===== setup-wizard へリダイレクト =====
    return res.redirect(`${process.env.APP_URL}/setup-wizard.html?registered=1`);

  } catch (err) {
    console.error('[auth/verify] エラー:', err);
    return res.redirect(`${process.env.APP_URL}/register.html?result=error`);
  }
});

// ============================================================
// POST /api/auth/resend
// 確認メール再送
// ============================================================
router.post('/resend', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'しばらく待ってから再試行してください' });
  }

  const { email } = req.body;
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'メールアドレスが正しくありません' });
  }

  try {
    // 未使用の最新トークンを検索
    const result = await pool.query(
      `SELECT * FROM email_verifications
       WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '有効な登録情報が見つかりません。最初から登録し直してください。' });
    }

    const row  = result.rows[0];
    const data = row.pending_data;
    const verifyUrl = `${process.env.APP_URL}/api/auth/verify?token=${row.token}`;

    const htmlBody = buildEmailHtml({
      company_name: data.company.companyName,
      admin_name:   data.admin.name,
      email:        email,
      verify_url:   verifyUrl,
      expire_hours: '24',
    });

    await ses.send(new SendEmailCommand({
      Source:      `ワンタッチ管理 <${process.env.SES_FROM_EMAIL}>`,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: '【ワンタッチ管理】メールアドレスの確認（再送）', Charset: 'UTF-8' },
        Body: {
          Html: { Data: htmlBody, Charset: 'UTF-8' },
          Text: { Data: `確認URL: ${verifyUrl}`, Charset: 'UTF-8' },
        },
      },
    }));

    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/resend] エラー:', err);
    return res.status(500).json({ error: 'メール送信に失敗しました' });
  }
});

module.exports = router;
