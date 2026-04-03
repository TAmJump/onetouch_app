const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize, officeScope } = require('../middleware/rbac');
const config = require('../config');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/items
 * 商品一覧（ページネーション + 検索 + カテゴリフィルタ）
 * 1施設3,000件 × 4万施設 = 1.2億件を想定
 */
router.get('/', officeScope, async (req, res) => {
  try {
    const { category, search, floor, page, limit, sort } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(config.MAX_PAGE_SIZE, parseInt(limit) || config.DEFAULT_PAGE_SIZE);
    const offset = (pageNum - 1) * pageSize;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    // ロール別スコープ
    if (req.user.role === 'contractor') {
      // 管理会社は担当商品のみ
      conditions.push(`i.assigned_partner_id = $${paramIdx++}`);
      params.push(req.user.companyCode);
    } else {
      if (req.companyFilter) {
        conditions.push(`i.company_code = $${paramIdx++}`);
        params.push(req.companyFilter);
      }
      if (req.officeFilter) {
        conditions.push(`i.office_code = $${paramIdx++}`);
        params.push(req.officeFilter);
      }
    }

    // フィルタ
    if (category) {
      conditions.push(`i.category = $${paramIdx++}`);
      params.push(category);
    }
    if (floor) {
      conditions.push(`i.floor = $${paramIdx++}`);
      params.push(floor);
    }
    if (search) {
      conditions.push(`(i.name ILIKE $${paramIdx} OR i.maker ILIKE $${paramIdx} OR i.model ILIKE $${paramIdx} OR i.location ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    // activeのみ（デフォルト）
    conditions.push(`i.status = 'active'`);

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    // ソート
    let sortColumn = 'i.updated_at DESC';
    if (sort === 'name') sortColumn = 'i.name ASC';
    if (sort === 'category') sortColumn = 'i.category ASC, i.name ASC';
    if (sort === 'oldest') sortColumn = 'i.created_at ASC';

    // 総件数
    const countResult = await db.query(
      `SELECT COUNT(*) FROM items i ${whereClause}`, params
    );
    const totalCount = parseInt(countResult.rows[0].count);

    // データ取得
    const dataResult = await db.query(
      `SELECT i.* FROM items i
       ${whereClause}
       ORDER BY ${sortColumn}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pageSize, offset]
    );

    res.json({
      data: dataResult.rows.map(formatItem),
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      }
    });

  } catch (err) {
    console.error('[ITEMS] List error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

/**
 * GET /api/items/stats
 * カテゴリ別件数（通報画面のカテゴリ選択で使用）
 */
router.get('/stats', officeScope, async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (req.companyFilter) {
      conditions.push(`company_code = $${paramIdx++}`);
      params.push(req.companyFilter);
    }
    if (req.officeFilter) {
      conditions.push(`office_code = $${paramIdx++}`);
      params.push(req.officeFilter);
    }
    conditions.push(`status = 'active'`);

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const result = await db.query(
      `SELECT category, COUNT(*) as count
       FROM items ${whereClause}
       GROUP BY category
       ORDER BY count DESC`,
      params
    );

    // フロア一覧も取得（フィルタUI用）
    const floorResult = await db.query(
      `SELECT DISTINCT floor FROM items ${whereClause} AND floor IS NOT NULL AND floor != '' ORDER BY floor`,
      params
    );

    res.json({
      categoryStats: result.rows.map(r => ({ category: r.category, count: parseInt(r.count) })),
      floors: floorResult.rows.map(r => r.floor),
      total: result.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
    });

  } catch (err) {
    console.error('[ITEMS] Stats error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

/**
 * GET /api/items/:id
 * 商品詳細
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM items WHERE item_id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '商品が見つかりません' });
    }

    const item = result.rows[0];

    // アクセス権チェック
    if (req.user.role !== 'system_admin' && req.user.role !== 'contractor') {
      if (item.company_code !== req.user.companyCode) {
        return res.status(403).json({ error: 'アクセス権がありません' });
      }
    }

    res.json(formatItem(item));

  } catch (err) {
    console.error('[ITEMS] Detail error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

/**
 * POST /api/items
 * 商品新規登録
 */
router.post('/', authorize('office_admin', 'company_admin', 'system_admin'), officeScope, async (req, res) => {
  try {
    const {
      name, category, maker, model, unit, price, stock,
      description, floor, location, officeCode,
      assignedPartnerId, assignedPartnerName
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: '商品名を入力してください' });
    }

    const companyCode = req.user.companyCode;
    const targetOffice = officeCode || req.user.officeCode;
    const itemId = 'ITEM-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

    await db.query(
      `INSERT INTO items
        (item_id, company_code, office_code, name, category, maker, model,
         unit, price, stock, description, floor, location,
         assigned_partner_id, assigned_partner_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [itemId, companyCode, targetOffice, name, category || null,
       maker || '', model || '', unit || '', price || 0, stock || 0,
       description || '', floor || '', location || '',
       assignedPartnerId || null, assignedPartnerName || '']
    );

    // 監査ログ
    await db.query(
      `INSERT INTO audit_logs (company_code, office_code, user_id, user_name, action, target_type, target_id, details)
       VALUES ($1,$2,$3,$4,'item_create','item',$5,$6)`,
      [companyCode, targetOffice, req.user.id, req.user.name, itemId,
       JSON.stringify({ name, category })]
    );

    res.status(201).json({ itemId, message: '商品を登録しました' });

  } catch (err) {
    console.error('[ITEMS] Create error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

/**
 * PUT /api/items/:id
 * 商品更新
 */
router.put('/:id', authorize('office_admin', 'company_admin', 'system_admin'), async (req, res) => {
  try {
    // 存在確認
    const current = await db.query('SELECT * FROM items WHERE item_id = $1', [req.params.id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: '商品が見つかりません' });
    }

    const item = current.rows[0];

    // 権限チェック
    if (req.user.role !== 'system_admin' && item.company_code !== req.user.companyCode) {
      return res.status(403).json({ error: 'この商品を更新する権限がありません' });
    }

    const {
      name, category, maker, model, unit, price, stock,
      description, floor, location, assignedPartnerId, assignedPartnerName
    } = req.body;

    await db.query(
      `UPDATE items SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        maker = COALESCE($3, maker),
        model = COALESCE($4, model),
        unit = COALESCE($5, unit),
        price = COALESCE($6, price),
        stock = COALESCE($7, stock),
        description = COALESCE($8, description),
        floor = COALESCE($9, floor),
        location = COALESCE($10, location),
        assigned_partner_id = $11,
        assigned_partner_name = $12
       WHERE item_id = $13`,
      [name, category, maker, model, unit, price, stock,
       description, floor, location,
       assignedPartnerId !== undefined ? assignedPartnerId : item.assigned_partner_id,
       assignedPartnerName !== undefined ? assignedPartnerName : item.assigned_partner_name,
       req.params.id]
    );

    // 監査ログ
    await db.query(
      `INSERT INTO audit_logs (company_code, office_code, user_id, user_name, action, target_type, target_id, details)
       VALUES ($1,$2,$3,$4,'item_update','item',$5,$6)`,
      [item.company_code, item.office_code, req.user.id, req.user.name, req.params.id,
       JSON.stringify({ name: name || item.name })]
    );

    res.json({ message: '商品を更新しました' });

  } catch (err) {
    console.error('[ITEMS] Update error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

/**
 * DELETE /api/items/:id
 * 商品削除（論理削除）
 */
router.delete('/:id', authorize('office_admin', 'company_admin', 'system_admin'), async (req, res) => {
  try {
    const current = await db.query('SELECT * FROM items WHERE item_id = $1', [req.params.id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: '商品が見つかりません' });
    }

    const item = current.rows[0];
    if (req.user.role !== 'system_admin' && item.company_code !== req.user.companyCode) {
      return res.status(403).json({ error: 'この商品を削除する権限がありません' });
    }

    // 論理削除（物理削除はしない）
    await db.query(
      `UPDATE items SET status = 'deleted' WHERE item_id = $1`,
      [req.params.id]
    );

    // 監査ログ
    await db.query(
      `INSERT INTO audit_logs (company_code, office_code, user_id, user_name, action, target_type, target_id, details)
       VALUES ($1,$2,$3,$4,'item_delete','item',$5,$6)`,
      [item.company_code, item.office_code, req.user.id, req.user.name, req.params.id,
       JSON.stringify({ name: item.name })]
    );

    res.json({ message: '商品を削除しました' });

  } catch (err) {
    console.error('[ITEMS] Delete error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

/**
 * POST /api/items/import
 * CSV一括インポート
 */
router.post('/import', authorize('office_admin', 'company_admin', 'system_admin'), officeScope, async (req, res) => {
  const client = await db.getClient();
  try {
    const { items, officeCode } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'インポートデータがありません' });
    }

    if (items.length > 5000) {
      return res.status(400).json({ error: '一度にインポートできるのは5,000件までです' });
    }

    const companyCode = req.user.companyCode;
    const targetOffice = officeCode || req.user.officeCode;

    await client.query('BEGIN');

    let imported = 0;
    for (const item of items) {
      const itemId = 'ITEM-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
      await client.query(
        `INSERT INTO items
          (item_id, company_code, office_code, name, category, maker, model,
           unit, price, stock, description, floor, location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [itemId, companyCode, targetOffice,
         item.name || '（名称なし）', item.category || null,
         item.maker || '', item.model || '',
         item.unit || '', item.price || 0, item.stock || 0,
         item.description || '', item.floor || '', item.location || '']
      );
      imported++;
    }

    await client.query('COMMIT');

    // 監査ログ
    await db.query(
      `INSERT INTO audit_logs (company_code, office_code, user_id, user_name, action, target_type, target_id, details)
       VALUES ($1,$2,$3,$4,'item_import','item',NULL,$5)`,
      [companyCode, targetOffice, req.user.id, req.user.name,
       JSON.stringify({ count: imported })]
    );

    res.json({ message: `${imported}件の商品をインポートしました`, count: imported });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ITEMS] Import error:', err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ========== ヘルパー ==========
function formatItem(row) {
  return {
    itemId: row.item_id,
    companyCode: row.company_code,
    officeCode: row.office_code,
    name: row.name,
    category: row.category,
    maker: row.maker,
    model: row.model,
    unit: row.unit,
    price: row.price,
    stock: row.stock,
    description: row.description,
    floor: row.floor,
    location: row.location,
    assignedPartnerId: row.assigned_partner_id,
    assignedPartnerName: row.assigned_partner_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
