/**
 * api-client.js
 * フロントエンド共通API通信モジュール
 * 
 * デモモード → 従来通りsessionStorage/localStorage
 * 本番モード → サーバーAPI（fetch）
 * 
 * 使い方:
 *   <script src="api-client.js"></script>
 *   const items = await API.items.list({ category: '建物・外', page: 1 });
 *   const report = await API.reports.create({ title: '水漏れ', ... });
 */
(function(window) {
  'use strict';

  // ========== 基盤 ==========

  /**
   * デモモードかどうか判定
   * items.html等と同じロジック: companyCode または isDemoMode フラグで判定
   */
  function isDemoMode() {
    // 明示的フラグ（互換性）
    if (sessionStorage.getItem('demo.mode') === 'true') return true;
    // currentUser の companyCode ベース判定（デモ環境の実際の動作）
    try {
      var user = JSON.parse(sessionStorage.getItem('currentUser'));
      if (!user) return false;
      if (user.companyCode === 'TAMJ' || user.companyCode === 'JMAT' || user.companyCode === 'SYSTEM') return true;
      if (user.isDemoMode) return true;
    } catch (e) {}
    // 管理会社（contractor）のデモ判定
    try {
      var contractor = JSON.parse(sessionStorage.getItem('currentContractor'));
      if (contractor) return true; // デモ環境ではcontractor情報がある = デモモード
    } catch (e) {}
    return false;
  }

  /**
   * JWTトークン取得
   */
  function getToken() {
    return localStorage.getItem('ONE_token') || sessionStorage.getItem('ONE_token') || '';
  }

  /**
   * 認証ヘッダー付きfetch
   */
  async function apiFetch(url, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      // トークン期限切れ → ログイン画面にリダイレクト
      localStorage.removeItem('ONE_token');
      sessionStorage.removeItem('ONE_token');
      window.location.href = 'login.html';
      throw new Error('認証切れ');
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'サーバーエラー' }));
      throw new Error(err.error || 'エラーが発生しました');
    }

    return response.json();
  }

  // ========== 認証API ==========
  const auth = {
    /**
     * ログイン
     * @returns {{ token, user }}
     */
    async login(loginId, password) {
      if (isDemoMode()) {
        return null; // デモモードはlogin.htmlの既存処理を使う
      }
      const result = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ loginId, password }),
      });
      // トークン保存
      localStorage.setItem('ONE_token', result.token);
      return result;
    },

    /**
     * 現在のユーザー情報取得
     */
    async me() {
      if (isDemoMode()) {
        return JSON.parse(sessionStorage.getItem('currentUser') || 'null');
      }
      const result = await apiFetch('/api/auth/me');
      return result.user;
    },

    /**
     * パスワード変更
     */
    async changePassword(currentPassword, newPassword) {
      if (isDemoMode()) {
        return { message: 'デモモードではパスワード変更できません' };
      }
      return apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },
  };

  // ========== カテゴリAPI ==========
  const categories = {
    /**
     * カテゴリ一覧取得
     * フロントはここから取得する（ハードコードしない）
     */
    async list() {
      if (isDemoMode()) {
        return (typeof SYSTEM_CATEGORIES !== 'undefined')
          ? SYSTEM_CATEGORIES.map(function(name, i) { return { id: i+1, name: name }; })
          : [];
      }
      return apiFetch('/api/categories');
    },
  };

  // ========== 通報API ==========
  const reports = {
    /**
     * 通報一覧取得
     * @param {Object} params - { status, category, search, page, limit, sort }
     * @returns {{ data: [], pagination: {} }}
     */
    async list(params = {}) {
      if (isDemoMode()) {
        return _demoReportsList(params);
      }
      const qs = new URLSearchParams();
      Object.keys(params).forEach(function(k) { if (params[k]) qs.set(k, params[k]); });
      return apiFetch('/api/reports?' + qs.toString());
    },

    /**
     * 通報詳細取得
     */
    async get(id) {
      if (isDemoMode()) {
        return _demoReportGet(id);
      }
      return apiFetch('/api/reports/' + id);
    },

    /**
     * 新規通報作成
     */
    async create(data) {
      if (isDemoMode()) {
        return _demoReportCreate(data);
      }
      return apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /**
     * ステータス更新
     */
    async updateStatus(id, status, contractorMemo) {
      if (isDemoMode()) {
        return _demoReportUpdateStatus(id, status, contractorMemo);
      }
      return apiFetch('/api/reports/' + id + '/status', {
        method: 'PUT',
        body: JSON.stringify({ status, contractorMemo }),
      });
    },
  };

  // ========== 商品API ==========
  const items = {
    /**
     * 商品一覧取得
     * @param {Object} params - { category, search, floor, page, limit, sort }
     * @returns {{ data: [], pagination: {} }}
     */
    async list(params = {}) {
      if (isDemoMode()) {
        return _demoItemsList(params);
      }
      const qs = new URLSearchParams();
      Object.keys(params).forEach(function(k) { if (params[k]) qs.set(k, params[k]); });
      return apiFetch('/api/items?' + qs.toString());
    },

    /**
     * カテゴリ別統計
     */
    async stats() {
      if (isDemoMode()) {
        return _demoItemsStats();
      }
      return apiFetch('/api/items/stats');
    },

    /**
     * 商品詳細
     */
    async get(id) {
      if (isDemoMode()) {
        return _demoItemGet(id);
      }
      return apiFetch('/api/items/' + id);
    },

    /**
     * 商品新規登録
     */
    async create(data) {
      if (isDemoMode()) {
        return _demoItemCreate(data);
      }
      return apiFetch('/api/items', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    /**
     * 商品更新
     */
    async update(id, data) {
      if (isDemoMode()) {
        return _demoItemUpdate(id, data);
      }
      return apiFetch('/api/items/' + id, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    /**
     * 商品削除
     */
    async remove(id) {
      if (isDemoMode()) {
        return _demoItemDelete(id);
      }
      return apiFetch('/api/items/' + id, { method: 'DELETE' });
    },

    /**
     * CSVインポート
     */
    async import(itemsArray, officeCode) {
      if (isDemoMode()) {
        return _demoItemImport(itemsArray);
      }
      return apiFetch('/api/items/import', {
        method: 'POST',
        body: JSON.stringify({ items: itemsArray, officeCode }),
      });
    },
  };

  // ========== デモモード用ヘルパー（既存localStorage処理のラッパー） ==========

  function _getStorage(key) {
    return JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || '[]');
  }
  function _setStorage(key, data) {
    var json = JSON.stringify(data);
    sessionStorage.setItem(key, json);
  }
  function _getCurrentUser() {
    return JSON.parse(sessionStorage.getItem('currentUser') || '{}');
  }

  // --- 通報（デモ） ---
  function _demoReportsList(params) {
    var reports = _getStorage('onetouch.reports');
    var user = _getCurrentUser();
    // フィルタ
    reports = reports.filter(function(r) {
      if (user.role === 'contractor') return r.assignedPartnerId === user.partnerId;
      if (user.companyCode) return r.companyCode === user.companyCode;
      return true;
    });
    if (params.status) reports = reports.filter(function(r) { return r.status === params.status; });
    if (params.category) reports = reports.filter(function(r) { return r.category === params.category; });
    if (params.search) {
      var s = params.search.toLowerCase();
      reports = reports.filter(function(r) { return (r.title || '').toLowerCase().indexOf(s) >= 0; });
    }
    reports.sort(function(a,b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    var page = parseInt(params.page) || 1;
    var limit = parseInt(params.limit) || 30;
    var start = (page - 1) * limit;
    return {
      data: reports.slice(start, start + limit),
      pagination: { page: page, limit: limit, total: reports.length, totalPages: Math.ceil(reports.length / limit) }
    };
  }

  function _demoReportGet(id) {
    var reports = _getStorage('onetouch.reports');
    return reports.find(function(r) { return r.id === id; }) || null;
  }

  function _demoReportCreate(data) {
    var reports = _getStorage('onetouch.reports');
    var user = _getCurrentUser();
    var report = Object.assign({}, data, {
      id: 'RPT-' + Date.now(),
      companyCode: user.companyCode,
      officeCode: user.officeCode,
      reporterId: user.id,
      reporterName: user.name,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    reports.push(report);
    _setStorage('onetouch.reports', reports);
    return { id: report.id, message: '通報を送信しました' };
  }

  function _demoReportUpdateStatus(id, status, memo) {
    var reports = _getStorage('onetouch.reports');
    var report = reports.find(function(r) { return r.id === id; });
    if (report) {
      report.status = status;
      if (memo) report.contractorMemo = memo;
      if (status === 'completed') report.completedAt = new Date().toISOString();
      report.updatedAt = new Date().toISOString();
      _setStorage('onetouch.reports', reports);
    }
    return { message: 'ステータスを更新しました', status: status };
  }

  // --- 商品（デモ） ---
  function _demoItemsList(params) {
    var items = _getStorage('onetouch.items');
    var user = _getCurrentUser();
    items = items.filter(function(i) {
      return i.companyCode === user.companyCode && (i.officeCode === user.officeCode || !i.officeCode);
    });
    if (params.category) items = items.filter(function(i) { return i.category === params.category; });
    if (params.floor) items = items.filter(function(i) { return i.floor === params.floor; });
    if (params.search) {
      var s = params.search.toLowerCase();
      items = items.filter(function(i) {
        return (i.name || '').toLowerCase().indexOf(s) >= 0 || (i.maker || '').toLowerCase().indexOf(s) >= 0;
      });
    }
    var page = parseInt(params.page) || 1;
    var limit = parseInt(params.limit) || 30;
    var start = (page - 1) * limit;
    return {
      data: items.slice(start, start + limit),
      pagination: { page: page, limit: limit, total: items.length, totalPages: Math.ceil(items.length / limit) }
    };
  }

  function _demoItemsStats() {
    var items = _getStorage('onetouch.items');
    var user = _getCurrentUser();
    items = items.filter(function(i) { return i.companyCode === user.companyCode; });
    var stats = {};
    var floors = {};
    items.forEach(function(i) {
      stats[i.category] = (stats[i.category] || 0) + 1;
      if (i.floor) floors[i.floor] = true;
    });
    return {
      categoryStats: Object.keys(stats).map(function(k) { return { category: k, count: stats[k] }; }),
      floors: Object.keys(floors).sort(),
      total: items.length,
    };
  }

  function _demoItemGet(id) {
    var items = _getStorage('onetouch.items');
    return items.find(function(i) { return i.itemId === id; }) || null;
  }

  function _demoItemCreate(data) {
    var items = _getStorage('onetouch.items');
    var user = _getCurrentUser();
    var item = Object.assign({}, data, {
      itemId: 'ITEM-' + Date.now(),
      companyCode: user.companyCode,
      officeCode: user.officeCode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    items.push(item);
    _setStorage('onetouch.items', items);
    return { itemId: item.itemId, message: '商品を登録しました' };
  }

  function _demoItemUpdate(id, data) {
    var items = _getStorage('onetouch.items');
    var item = items.find(function(i) { return i.itemId === id; });
    if (item) {
      Object.assign(item, data, { updatedAt: new Date().toISOString() });
      _setStorage('onetouch.items', items);
    }
    return { message: '商品を更新しました' };
  }

  function _demoItemDelete(id) {
    var items = _getStorage('onetouch.items');
    items = items.filter(function(i) { return i.itemId !== id; });
    _setStorage('onetouch.items', items);
    return { message: '商品を削除しました' };
  }

  function _demoItemImport(arr) {
    var items = _getStorage('onetouch.items');
    var user = _getCurrentUser();
    arr.forEach(function(data) {
      items.push(Object.assign({}, data, {
        itemId: 'ITEM-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
        companyCode: user.companyCode,
        officeCode: user.officeCode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    });
    _setStorage('onetouch.items', items);
    return { message: arr.length + '件の商品をインポートしました', count: arr.length };
  }

  // ========== グローバル公開 ==========
  window.API = {
    auth: auth,
    categories: categories,
    reports: reports,
    items: items,
    // ユーティリティ
    isDemoMode: isDemoMode,
    getToken: getToken,
    fetch: apiFetch,
  };

})(window);
