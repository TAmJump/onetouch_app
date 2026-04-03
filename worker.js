/**
 * ワンタッチ管理 - Cloudflare Worker v1.0
 * 認証・プラン管理API
 *
 * デプロイ方法:
 *   wrangler deploy
 *
 * 環境変数（wrangler secretで設定）:
 *   JWT_SECRET       - JWT署名キー（任意の長い文字列）
 *   ADMIN_TOKEN      - システム管理者APIトークン
 *
 * D1データベース（wrangler.tomlで設定）:
 *   [[d1_databases]]
 *   binding = "DB"
 *   database_name = "onetouch_db"
 *   database_id = "YOUR_DB_ID"
 */

const CORS_ORIGINS = [
  'https://app.one-touch.tamjump.com',
  'https://tamjump.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:5500'
];

// ========== CORS ==========
function corsHeaders(origin) {
  const allowed = CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
    'Access-Control-Allow-Credentials': 'true'
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

// ========== パスワードハッシュ（PBKDF2） ==========
async function hashPassword(password) {
  const enc = new TextEncoder();
  const saltArr = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(saltArr).map(b => b.toString(16).padStart(2,'0')).join('');
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(saltHex), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
  return saltHex + ':' + hashHex;
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(saltHex), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  const testHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
  return testHex === hashHex;
}

// ========== セッション ==========
function genSessionId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2,'0')).join('');
}

async function createSession(db, accountId, companyCode) {
  const sessionId = genSessionId();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(
    'INSERT INTO sessions (id, account_id, company_code, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(sessionId, accountId, companyCode, expiresAt).run();
  return { sessionId, expiresAt };
}

async function getSession(db, sessionId) {
  if (!sessionId) return null;
  const row = await db.prepare(
    'SELECT s.*, a.name, a.role, a.login_name, c.plan, c.name as company_name ' +
    'FROM sessions s ' +
    'JOIN accounts a ON s.account_id = a.id ' +
    'JOIN companies c ON s.company_code = c.company_code ' +
    'WHERE s.id = ? AND s.expires_at > datetime("now")'
  ).bind(sessionId).first();
  return row || null;
}

// ========== リクエストからセッションID取得 ==========
function extractSession(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/onetouch_session=([^;]+)/);
  if (match) return match[1];
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ========== メインハンドラ ==========
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const path = url.pathname;

    // ヘルスチェック
    if (path === '/api/health') {
      return json({ status: 'ok', timestamp: new Date().toISOString() }, 200, origin);
    }

    // ========== 認証系 ==========

    // POST /api/auth/register
    if (path === '/api/auth/register' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { companyCode, companyName, repName, email, adminName, adminLogin, password, plan } = body;

        if (!companyCode || !companyName || !email || !adminName || !adminLogin || !password) {
          return json({ error: '必須項目が不足しています' }, 400, origin);
        }
        if (!/^[A-Z0-9]{2,4}$/.test(companyCode)) {
          return json({ error: '会社コードは2〜4文字の半角英大文字・数字です' }, 400, origin);
        }
        if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
          return json({ error: 'パスワードは8文字以上・英字と数字を含めてください' }, 400, origin);
        }

        // 重複チェック
        const existing = await env.DB.prepare('SELECT id FROM companies WHERE company_code = ?').bind(companyCode).first();
        if (existing) return json({ error: 'この会社コードはすでに使われています' }, 409, origin);

        const loginId = companyCode + '-' + adminLogin;
        const existAcc = await env.DB.prepare('SELECT id FROM accounts WHERE id = ?').bind(loginId).first();
        if (existAcc) return json({ error: 'このログイン名はすでに使われています' }, 409, origin);

        const passwordHash = await hashPassword(password);
        const now = new Date().toISOString();

        // 会社登録
        await env.DB.prepare(
          'INSERT INTO companies (company_code, name, rep_name, email, plan, status, created_at) VALUES (?, ?, ?, ?, ?, "active", ?)'
        ).bind(companyCode, companyName, repName || '', email, plan || 'free', now).run();

        // 管理者アカウント登録
        await env.DB.prepare(
          'INSERT INTO accounts (id, login_name, company_code, company_name, name, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, "company_admin", "active", ?)'
        ).bind(loginId, adminLogin, companyCode, companyName, adminName, email, passwordHash, now).run();

        // セッション発行
        const { sessionId, expiresAt } = await createSession(env.DB, loginId, companyCode);

        const headers = {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
          'Set-Cookie': `onetouch_session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${new Date(expiresAt).toUTCString()}`
        };
        return new Response(JSON.stringify({
          token: sessionId,
          user: { id: loginId, loginName: adminLogin, companyCode, companyName, name: adminName, role: 'company_admin', plan: plan || 'free' }
        }), { status: 201, headers });

      } catch (e) {
        return json({ error: 'サーバーエラー: ' + e.message }, 500, origin);
      }
    }

    // POST /api/auth/login
    if (path === '/api/auth/login' && request.method === 'POST') {
      try {
        const { loginId, password } = await request.json();
        if (!loginId || !password) return json({ error: 'ログインIDとパスワードを入力してください' }, 400, origin);

        const account = await env.DB.prepare(
          'SELECT a.*, c.name as company_name, c.plan FROM accounts a JOIN companies c ON a.company_code = c.company_code WHERE a.id = ? AND a.status = "active"'
        ).bind(loginId).first();

        if (!account) return json({ error: 'ログインIDまたはパスワードが正しくありません' }, 401, origin);
        const ok = await verifyPassword(password, account.password_hash);
        if (!ok) return json({ error: 'ログインIDまたはパスワードが正しくありません' }, 401, origin);

        const { sessionId, expiresAt } = await createSession(env.DB, account.id, account.company_code);
        const userObj = {
          id: account.id, loginName: account.login_name,
          companyCode: account.company_code, companyName: account.company_name,
          name: account.name, role: account.role,
          officeCode: account.office_code || '', officeName: account.office_name || '',
          plan: account.plan || 'free', status: 'active'
        };

        const headers = {
          ...corsHeaders(origin), 'Content-Type': 'application/json',
          'Set-Cookie': `onetouch_session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${new Date(expiresAt).toUTCString()}`
        };
        return new Response(JSON.stringify({ token: sessionId, user: userObj }), { status: 200, headers });

      } catch (e) {
        return json({ error: 'サーバーエラー' }, 500, origin);
      }
    }

    // GET /api/auth/me
    if (path === '/api/auth/me' && request.method === 'GET') {
      const sessionId = extractSession(request);
      const session = await getSession(env.DB, sessionId);
      if (!session) return json({ error: '未ログイン' }, 401, origin);
      return json({
        id: session.account_id, loginName: session.login_name,
        companyCode: session.company_code, companyName: session.company_name,
        name: session.name, role: session.role, plan: session.plan
      }, 200, origin);
    }

    // POST /api/auth/logout
    if (path === '/api/auth/logout' && request.method === 'POST') {
      const sessionId = extractSession(request);
      if (sessionId) {
        await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
      }
      const headers = {
        ...corsHeaders(origin), 'Content-Type': 'application/json',
        'Set-Cookie': 'onetouch_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
      };
      return new Response(JSON.stringify({ message: 'ログアウトしました' }), { status: 200, headers });
    }

    // POST /api/auth/upgrade  （管理者がProに昇格）
    if (path === '/api/auth/upgrade' && request.method === 'POST') {
      const adminToken = request.headers.get('X-Admin-Token');
      if (adminToken !== env.ADMIN_TOKEN) return json({ error: '認証エラー' }, 403, origin);
      try {
        const { companyCode, action } = await request.json();
        const plan = action === 'upgrade' ? 'pro' : 'free';
        await env.DB.prepare('UPDATE companies SET plan = ? WHERE company_code = ?').bind(plan, companyCode).run();
        await env.DB.prepare('UPDATE accounts SET plan = ? WHERE company_code = ?').bind(plan, companyCode).run();
        return json({ message: `${companyCode} を ${plan} に変更しました` }, 200, origin);
      } catch (e) {
        return json({ error: 'サーバーエラー' }, 500, origin);
      }
    }

    // ========== 管理者系 ==========

    // GET /api/admin/companies
    if (path === '/api/admin/companies' && request.method === 'GET') {
      if (request.headers.get('X-Admin-Token') !== env.ADMIN_TOKEN) return json({ error: '認証エラー' }, 403, origin);
      const rows = await env.DB.prepare('SELECT company_code, name, email, plan, status, created_at FROM companies ORDER BY created_at DESC').all();
      return json(rows.results, 200, origin);
    }

    return json({ error: 'Not Found' }, 404, origin);
  }
};
