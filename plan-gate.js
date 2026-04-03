/**
 * plan-gate.js v1.0
 * ワンタッチ管理 - プラン管理・機能制限システム
 * demo-mode.js を置き換え
 */

// ========== プラン定義 ==========
var PLAN_FREE = 'free';
var PLAN_PRO  = 'pro';

var PLAN_LIMITS = {
  free: { offices: 1, accounts: 5, partners: 3, items: 100, reportHistory: 30 },
  pro:  { offices: Infinity, accounts: Infinity, partners: Infinity, items: Infinity, reportHistory: Infinity }
};

var PLAN_FEATURES = {
  free: {
    report: true, importCsv: true, importExcel: true,
    importPdf: false, importImage: false, exportCsv: false,
    auditLog: false, backup: false, lineNotify: false,
    contractorPerf: false, multiOffice: false
  },
  pro: {
    report: true, importCsv: true, importExcel: true,
    importPdf: true, importImage: true, exportCsv: true,
    auditLog: true, backup: true, lineNotify: true,
    contractorPerf: true, multiOffice: true
  }
};

var FEATURE_NAMES = {
  importPdf: 'PDF取り込み', importImage: '画像取り込み',
  exportCsv: '通報履歴CSV出力', auditLog: '監査ログ',
  backup: 'データバックアップ', lineNotify: 'LINE通知',
  contractorPerf: '管理会社分析', multiOffice: '複数事業所管理'
};

// ========== ストレージキー ==========
var ONE = {
  KEYS: {
    auth: 'onetouch.auth', reports: 'onetouch.reports',
    items: 'onetouch.items', offices: 'offices',
    accounts: 'accounts', partners: 'partners',
    companies: 'companies', contracts: 'onetouch.contracts',
    facilityId: 'onetouch.facilityId', auditLogs: 'audit.logs'
  }
};

// ========== 認証 ==========
function getCurrentUser() {
  try {
    var raw = sessionStorage.getItem('currentUser');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function getUserPlan() {
  var user = getCurrentUser();
  if (!user) return PLAN_FREE;
  return user.plan || PLAN_FREE;
}

function isPro() { return getUserPlan() === PLAN_PRO; }

function isSystemAdmin() {
  var user = getCurrentUser();
  return !!(user && user.role === 'system_admin');
}

// 後方互換（旧コードとの互換性維持）
function isDemoMode() { return false; }

function demoSaveToLocalStorage(key, value) {
  localStorage.setItem(key, value);
  return true;
}

function demoGetFromLocalStorage(key) {
  return localStorage.getItem(key);
}

// ========== プラン制限チェック ==========
function getPlanLimit(resource) {
  var plan = getUserPlan();
  var limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  var v = limits[resource];
  return v !== undefined ? v : 0;
}

function checkPlanLimit(resource) {
  var limit = getPlanLimit(resource);
  if (limit === Infinity) return { allowed: true };
  var counts = {
    offices:       (JSON.parse(localStorage.getItem('offices') || '[]')).length,
    accounts:      (JSON.parse(localStorage.getItem('accounts') || '[]')).length,
    partners:      (JSON.parse(localStorage.getItem('partners') || '[]')).length,
    items:         (JSON.parse(localStorage.getItem('onetouch.items') || '[]')).length,
    reportHistory: (JSON.parse(localStorage.getItem('onetouch.reports') || '[]')).length
  };
  var current = counts[resource] || 0;
  if (current >= limit) {
    return { allowed: false, limit: limit, current: current,
      message: _limitMsg(resource, limit) };
  }
  return { allowed: true, limit: limit, current: current };
}

function _limitMsg(resource, limit) {
  var n = { offices:'事業所', accounts:'アカウント', partners:'管理会社',
            items:'商品マスタ', reportHistory:'通報履歴' };
  return (n[resource]||resource) + 'の上限（' + limit + '件）に達しました。Proプランで制限解除できます。';
}

// ========== 機能ゲート ==========
function isFeatureEnabled(feature) {
  var f = PLAN_FEATURES[getUserPlan()] || PLAN_FEATURES.free;
  return f[feature] !== false;
}

function requireProFeature(feature, onAllowed) {
  if (isFeatureEnabled(feature)) {
    if (typeof onAllowed === 'function') onAllowed();
    return true;
  }
  showUpgradeModal(feature);
  return false;
}

// ========== アップグレードモーダル ==========
function showUpgradeModal(feature) {
  var el = document.getElementById('_pgModal');
  if (el) el.remove();
  var name = FEATURE_NAMES[feature] || feature;
  var modal = document.createElement('div');
  modal.id = '_pgModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:99999;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:16px;padding:40px 28px;max-width:380px;width:90%;text-align:center;">' +
    '<div style="font-size:44px;margin-bottom:14px;">🔒</div>' +
    '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:10px;">Proプランが必要です</div>' +
    '<div style="font-size:14px;color:#64748b;margin-bottom:26px;line-height:1.7;">' +
    '「' + name + '」はProプランの機能です。<br>アップグレードで全機能をご利用いただけます。</div>' +
    '<div style="display:flex;gap:10px;justify-content:center;">' +
    '<button onclick="document.getElementById(\'_pgModal\').remove()" ' +
    'style="padding:10px 22px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;color:#334155;">閉じる</button>' +
    '<a href="upgrade.html" style="padding:10px 22px;background:#1e3a5f;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Proにアップグレード</a>' +
    '</div></div>';
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e){ if(e.target===modal) modal.remove(); });
}

// ========== 制限バナー ==========
function showLimitBanner(resource) {
  var r = checkPlanLimit(resource);
  if (r.allowed) return;
  var banner = document.createElement('div');
  banner.style.cssText = 'background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;';
  banner.innerHTML = '<span style="color:#92400e;">' + r.message + '</span>' +
    '<a href="upgrade.html" style="background:#1e3a5f;color:#fff;padding:6px 14px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;white-space:nowrap;">アップグレード</a>';
  var c = document.querySelector('.container, main, #main, body');
  if (c && c.firstChild) c.insertBefore(banner, c.firstChild);
}

// ========== システムカテゴリ（互換性維持） ==========
window.SYSTEM_CATEGORIES = ['建物・外','部屋・共用部','介護医療備品','厨房','ネットワーク','その他'];

// ========== 通報履歴の自動トリム（無料プラン） ==========
function _trimReportHistory() {
  if (isPro()) return;
  var limit = getPlanLimit('reportHistory');
  if (limit === Infinity) return;
  var key = 'onetouch.reports';
  var reports = JSON.parse(localStorage.getItem(key) || '[]');
  if (reports.length > limit) {
    reports = reports.slice(-limit);
    localStorage.setItem(key, JSON.stringify(reports));
  }
}

// ========== 初期化 ==========
document.addEventListener('DOMContentLoaded', function() {
  _trimReportHistory();
  // Proバッジ表示
  setTimeout(function() {
    if (isPro()) {
      var t = document.querySelector('.header-page-title, .page-title, h1');
      if (t && !document.getElementById('_proBadge')) {
        var b = document.createElement('span');
        b.id = '_proBadge';
        b.style.cssText = 'display:inline-block;background:#1e3a5f;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;margin-left:8px;vertical-align:middle;';
        b.textContent = 'PRO';
        t.appendChild(b);
      }
    }
  }, 400);
});
