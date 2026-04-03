/**
 * document-storage.js
 * Documents（書類）とLineItems（明細行）の管理
 * DEMOモード: sessionStorage / 本番: localStorage
 */

function _docStorageIsDemoMode() {
  try {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    return currentUser && currentUser.companyCode === 'TAMJ';
  } catch (e) { return false; }
}

function _docStorageGet(type) {
  const key = _docStorageIsDemoMode() ? 'demo.' + type : 'onetouch.' + type;
  const storage = _docStorageIsDemoMode() ? sessionStorage : localStorage;
  return JSON.parse(storage.getItem(key) || '[]');
}

function _docStorageSet(type, data) {
  const key = _docStorageIsDemoMode() ? 'demo.' + type : 'onetouch.' + type;
  const storage = _docStorageIsDemoMode() ? sessionStorage : localStorage;
  storage.setItem(key, JSON.stringify(data));
}

// === Documents ===

async function addDocument(doc) {
  if (!doc.docId) {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    doc.docId = `DOC-${dateStr}-${random}`;
  }
  doc.uploadedAt = doc.uploadedAt || new Date().toISOString();
  doc.status = doc.status || 'pending';
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
  doc.companyCode = doc.companyCode || (currentUser && currentUser.companyCode) || '';
  doc.officeCode = doc.officeCode || (currentUser && currentUser.officeCode) || '';
  const docs = _docStorageGet('documents');
  docs.push(doc);
  _docStorageSet('documents', docs);
  return doc;
}

async function getDocuments(officeCode) {
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
  const docs = _docStorageGet('documents');
  if (!currentUser) return [];
  if (currentUser.role === 'system_admin') return docs;
  if (currentUser.role === 'company_admin') return docs.filter(d => d.companyCode === currentUser.companyCode);
  return docs.filter(d => d.officeCode === (officeCode || currentUser.officeCode));
}

async function getDocument(docId) {
  const docs = _docStorageGet('documents');
  return docs.find(d => d.docId === docId) || null;
}

async function updateDocument(doc) {
  const docs = _docStorageGet('documents');
  const index = docs.findIndex(d => d.docId === doc.docId);
  if (index !== -1) { docs[index] = doc; _docStorageSet('documents', docs); }
  return doc;
}

async function deleteDocument(docId) {
  const docs = _docStorageGet('documents').filter(d => d.docId !== docId);
  _docStorageSet('documents', docs);
  await deleteLineItemsByDoc(docId);
  return true;
}

// === LineItems ===

async function addLineItems(items) {
  const existing = _docStorageGet('lineItems');
  items.forEach(item => {
    if (!item.lineId) {
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      item.lineId = `LINE-${random}`;
    }
    item.status = item.status || 'pending';
  });
  _docStorageSet('lineItems', existing.concat(items));
  return items;
}

async function getLineItemsByDoc(docId) {
  return _docStorageGet('lineItems').filter(i => i.docId === docId);
}

async function updateLineItem(item) {
  const items = _docStorageGet('lineItems');
  const index = items.findIndex(i => i.lineId === item.lineId);
  if (index !== -1) { items[index] = item; _docStorageSet('lineItems', items); }
  return item;
}

async function deleteLineItemsByDoc(docId) {
  _docStorageSet('lineItems', _docStorageGet('lineItems').filter(i => i.docId !== docId));
  return true;
}

async function deleteLineItem(lineId) {
  _docStorageSet('lineItems', _docStorageGet('lineItems').filter(i => i.lineId !== lineId));
  return true;
}

async function confirmLineItems(docId) {
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
  if (!currentUser) throw new Error('ログイン情報がありません');

  const lineItems = await getLineItemsByDoc(docId);
  const validItems = lineItems.filter(i => i.name && i.name.trim());
  if (validItems.length === 0) throw new Error('登録する商品がありません');

  // LineItems → Items（商品マスタ）に変換
  const itemsKey = 'onetouch.items';
  const storage = _docStorageIsDemoMode() ? sessionStorage : localStorage;
  const existingItems = JSON.parse(storage.getItem(itemsKey) || '[]');

  const newItems = validItems.map(line => {
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return {
      itemId: `ITEM-${dateStr}-${random}`,
      companyCode: currentUser.companyCode,
      officeCode: currentUser.officeCode,
      name: line.name,
      maker: line.maker || '',
      model: line.model || '',
      category: line.category || '',
      floor: line.floor || '',
      location: line.location || '',
      unit: line.unit || '個',
      price: line.price || line.unitPrice || 0,
      stock: line.quantity || line.qty || 1,
      description: '',
      assignedPartnerId: line.assignedPartnerId || '',
      assignedPartnerName: line.assignedPartnerName || '',
      sourceDocId: docId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.userId || currentUser.id,
    };
  });

  storage.setItem(itemsKey, JSON.stringify(existingItems.concat(newItems)));

  // ドキュメントのステータスを更新
  const doc = await getDocument(docId);
  if (doc) { doc.status = 'confirmed'; doc.confirmedAt = new Date().toISOString(); await updateDocument(doc); }

  // LineItemsを削除
  await deleteLineItemsByDoc(docId);
  return newItems;
}

window.DocumentStorage = {
  addDocument, getDocument, getDocuments, updateDocument, deleteDocument,
  addLineItems, getLineItemsByDoc, updateLineItem, deleteLineItemsByDoc, deleteLineItem, confirmLineItems
};
