/**
 * ロールベースアクセス制御（RBAC）ミドルウェア
 * 
 * 使い方:
 *   router.get('/offices', authorize('office_admin', 'company_admin', 'system_admin'), handler)
 *   router.post('/reports', authorize('staff', 'office_admin', 'company_admin'), handler)
 */

// ロールの権限レベル（数字が大きいほど権限が高い）
const ROLE_LEVELS = {
  staff: 1,
  office_admin: 2,
  company_admin: 3,
  system_admin: 4,
  contractor: 0, // 管理会社は別系統
};

/**
 * 指定ロールのいずれかを持つユーザーのみ許可
 * @param  {...string} allowedRoles - 許可するロール
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '認証が必要です' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'この操作を行う権限がありません' });
    }

    next();
  };
}

/**
 * 同じ会社のデータのみアクセスを許可するフィルタ
 * system_adminは全社アクセス可
 */
function companyScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  // system_adminは全社OK
  if (req.user.role === 'system_admin') {
    req.companyFilter = null; // フィルタなし
  } else {
    req.companyFilter = req.user.companyCode;
  }

  next();
}

/**
 * 同じ事業所のデータのみアクセスを許可するフィルタ
 * company_admin以上は会社内全事業所OK
 */
function officeScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: '認証が必要です' });
  }

  const level = ROLE_LEVELS[req.user.role] || 0;

  if (req.user.role === 'system_admin') {
    req.companyFilter = null;
    req.officeFilter = null;
  } else if (level >= ROLE_LEVELS.company_admin) {
    req.companyFilter = req.user.companyCode;
    req.officeFilter = null; // 会社内全事業所
  } else {
    req.companyFilter = req.user.companyCode;
    req.officeFilter = req.user.officeCode;
  }

  next();
}

module.exports = { authorize, companyScope, officeScope, ROLE_LEVELS };
