/**
 * item-storage.js
 * 商品データ管理（ハイブリッド方式）
 * - DEMOモード（TAMJ）: sessionStorage
 * - 本番: IndexedDB
 */

// ============================================
// IndexedDB設定
// ============================================
const DB_NAME = 'OneTouchDB';
const DB_VERSION = 1;
let db = null;

// データベースを開く
async function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Items ストア作成
      if (!database.objectStoreNames.contains('items')) {
        const itemStore = database.createObjectStore('items', { keyPath: 'itemId' });
        itemStore.createIndex('companyCode', 'companyCode', { unique: false });
        itemStore.createIndex('officeCode', 'officeCode', { unique: false });
        itemStore.createIndex('category', 'category', { unique: false });
        itemStore.createIndex('maker', 'maker', { unique: false });
        itemStore.createIndex('name', 'name', { unique: false });
        itemStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

// ============================================
// DEMOモード判定
// ============================================
function isDemoMode() {
  try {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return false;
    if (currentUser.companyCode === 'TAMJ') return true;
    if (currentUser.isDemoMode) return true;
    return false;
  } catch (e) {
    return false;
  }
}

// ============================================
// サンプルデータ生成（DEMOモードのみ）
// ============================================
function generateDemoItems() {
  const items = [];
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
  
  const categories = [
    { name: '食品', makers: ['キッコーマン', '味の素', 'カゴメ', '日清食品'] },
    { name: '日用品', makers: ['花王', 'ライオン', 'P&G', 'ユニ・チャーム'] },
    { name: '医療用具', makers: 'テルモ', 'オムロン', 'タニタ', 'ニプロ'] },
    { name: 'その他', makers: ['メーカーA', 'メーカーB', 'メーカーC', 'メーカーD'] }
  ];
  
  const products = {
    '食品': ['米', 'パン', '麺類', '缶詰', '調味料', '飲料'],
    '日用品': ['おむつ', 'ティッシュ', '洗剤', 'シャンプー', 'タオル'],
    '医療用具': ['体温計', '血圧計', 'ガーゼ', '包帯', '消毒液'],
    'その他': ['文房具', '清掃用具', '園芸用品', '工具', '備品']
  };
  
  let id = 1;
  
  categories.forEach(cat => {
    const count = cat.name === '食品' || cat.name === '日用品' ? 30 : 20;
    const productList = products[cat.name];
    
    for (let i = 0; i < count; i++) {
      const maker = cat.makers[Math.floor(Math.random() * cat.makers.length)];
      const product = productList[i % productList.length];
      
      items.push({
        itemId: `DEMO-ITEM-${String(id).padStart(3, '0')}`,
        companyCode: 'TAMJ',
        officeCode: currentUser.officeCode || 'TAMJ-J0001',
        name: `${product}${Math.floor(i / productList.length) + 1}`,
        category: cat.name,
        maker: maker,
        model: `MODEL-${String(id).padStart(4, '0')}`,
        price: Math.floor(Math.random() * 10000) + 500,
        stock: Math.floor(Math.random() * 100) + 10,
        unit: cat.name === '食品' ? 'kg' : '個',
        description: `${cat.name}のサンプル商品です`,
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString()
      });
      id++;
    }
  });
  
  return items;
}

// DEMOモードのサンプルデータ初期化
async function initDemoItems() {
  if (!isDemoMode()) return;
  
  // 既にデータがある場合はスキップ
  const existing = localStorage.getItem('onetouch.items');
  if (existing) return;
  
  // サンプル100件を生成
  const demoItems = generateDemoItems();
  localStorage.setItem('onetouch.items', JSON.stringify(demoItems));
  
}

// ============================================
// CRUD操作（ハイブリッド）
// ============================================

// 商品一覧取得
async function getItems() {
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
  if (!currentUser) return [];
  
  // DEMOモード
  if (isDemoMode()) {
    const items = JSON.parse(localStorage.getItem('onetouch.items') || '[]');
    return items;
  }
  
  // 本番モード（IndexedDB）
  try {
    const database = await openDB();
    const transaction = database.transaction(['items'], 'readonly');
    const store = transaction.objectStore('items');
    
    let items = [];
    
    // scope別フィルタリング
    if (currentUser.role === 'system_admin') {
      // 全商品
      items = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } else if (currentUser.role === 'company_admin') {
      // 自社の全商品
      const index = store.index('companyCode');
      items = await new Promise((resolve, reject) => {
        const request = index.getAll(currentUser.companyCode);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } else {
      // 自事業所の商品
      const index = store.index('officeCode');
      items = await new Promise((resolve, reject) => {
        const request = index.getAll(currentUser.officeCode);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    
    return items;
  } catch (e) {
    console.error('商品取得エラー:', e);
    return [];
  }
}

// 商品登録
async function addItem(item) {
  
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
  
  // 自動生成
  if (!item.itemId) {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    item.itemId = `ITEM-${dateStr}-${random}`;
  }
  
  
  item.createdAt = item.createdAt || new Date().toISOString();
  item.updatedAt = new Date().toISOString();
  item.companyCode = item.companyCode || currentUser.companyCode;
  item.officeCode = item.officeCode || currentUser.officeCode;
  
  
  // DEMOモード
  if (isDemoMode()) {
    const items = JSON.parse(localStorage.getItem('onetouch.items') || '[]');
    items.push(item);
    localStorage.setItem('onetouch.items', JSON.stringify(items));
    return item;
  }
  
  // 本番モード（IndexedDB）
  try {
    const database = await openDB();
    const transaction = database.transaction(['items'], 'readwrite');
    const store = transaction.objectStore('items');
    
    await new Promise((resolve, reject) => {
      const request = store.add(item);
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        console.error('[addItem] IndexedDB保存失敗:', request.error);
        reject(request.error);
      };
    });
    
    return item;
  } catch (e) {
    console.error('商品登録エラー:', e);
    throw e;
  }
}

// 商品更新
async function updateItem(item) {
  item.updatedAt = new Date().toISOString();
  
  // DEMOモード
  if (isDemoMode()) {
    const items = JSON.parse(localStorage.getItem('onetouch.items') || '[]');
    const index = items.findIndex(i => i.itemId === item.itemId);
    if (index !== -1) {
      items[index] = item;
      localStorage.setItem('onetouch.items', JSON.stringify(items));
    }
    return item;
  }
  
  // 本番モード（IndexedDB）
  try {
    const database = await openDB();
    const transaction = database.transaction(['items'], 'readwrite');
    const store = transaction.objectStore('items');
    
    await new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    return item;
  } catch (e) {
    console.error('商品更新エラー:', e);
    throw e;
  }
}

// 商品削除
async function deleteItem(itemId) {
  // DEMOモード
  if (isDemoMode()) {
    const items = JSON.parse(localStorage.getItem('onetouch.items') || '[]');
    const filtered = items.filter(i => i.itemId !== itemId);
    localStorage.setItem('onetouch.items', JSON.stringify(filtered));
    return true;
  }
  
  // 本番モード（IndexedDB）
  try {
    const database = await openDB();
    const transaction = database.transaction(['items'], 'readwrite');
    const store = transaction.objectStore('items');
    
    await new Promise((resolve, reject) => {
      const request = store.delete(itemId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    return true;
  } catch (e) {
    console.error('商品削除エラー:', e);
    throw e;
  }
}

// 商品検索
async function searchItems(query) {
  const items = await getItems();
  
  if (!query) return items;
  
  const q = query.toLowerCase();
  return items.filter(item => 
    (item.name && item.name.toLowerCase().includes(q)) ||
    (item.maker && item.maker.toLowerCase().includes(q)) ||
    (item.model && item.model.toLowerCase().includes(q)) ||
    (item.category && item.category.toLowerCase().includes(q))
  );
}

// ============================================
// グローバル公開
// ============================================
window.ItemStorage = {
  isDemoMode,
  initDemoItems,
  getItems,
  addItem,
  updateItem,
  deleteItem,
  searchItems
};
