/**
 * csv-utils.js
 * CSV解析ユーティリティ
 */

// ============================================
// CSV行の解析（引用符対応）
// ============================================
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      // 引用符のエスケープ処理（"" → "）
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;  // 次の引用符をスキップ
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // 引用符外のカンマはフィールド区切り
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // 最後のフィールド
  result.push(current.trim());
  
  return result;
}

// ============================================
// テキストの正規化
// ============================================
function normalizeText(text) {
  if (!text) return '';
  
  return text
    // 全角英数字 → 半角
    .replace(/[\uff01-\uff5e]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 全角スペース → 半角スペース
    .replace(/\u3000/g, ' ')
    // カンマ除去（数値用）
    .replace(/,/g, '')
    // 前後の空白削除
    .trim();
}

// ============================================
// 数値の抽出
// ============================================
function parseNumber(text) {
  if (!text) return 0;
  
  // 正規化して数字とマイナス、ピリオドのみ残す
  const normalized = normalizeText(text).replace(/[^0-9.-]/g, '');
  const num = parseFloat(normalized);
  
  return isNaN(num) ? 0 : num;
}

// ============================================
// CSVファイル全体をパース
// ============================================
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) return [];
  
  // ヘッダー行
  const headers = parseCSVLine(lines[0]);
  
  // データ行
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    
    // ヘッダーとマッピング
    const row = {};
    headers.forEach((header, index) => {
      row[header] = fields[index] || '';
    });
    
    data.push(row);
  }
  
  return data;
}

// ============================================
// CSVファイル読み込み
// ============================================
function readCSVFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const data = parseCSV(text);
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
    
    reader.readAsText(file, 'UTF-8');
  });
}

// ============================================
// 商品データのバリデーション
// ============================================
function validateItemData(row) {
  const errors = [];
  
  // 必須フィールド
  if (!row.name && !row['商品名']) {
    errors.push('商品名が入力されていません');
  }
  
  // 数値フィールド
  const price = parseNumber(row.price || row['単価'] || row['価格']);
  if (price < 0) {
    errors.push('価格は0以上である必要があります');
  }
  
  const stock = parseNumber(row.stock || row['在庫'] || row['数量']);
  if (stock < 0) {
    errors.push('在庫は0以上である必要があります');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// ============================================
// CSVデータを商品データに変換
// ============================================
function csvToItems(csvData, defaultValues = {}) {
  const items = [];
  
  csvData.forEach((row, index) => {
    // バリデーション
    const validation = validateItemData(row);
    if (!validation.valid) {
      console.warn(`行 ${index + 2} のエラー:`, validation.errors);
      return;
    }
    
    // データ変換
    const item = {
      itemId: null,  // 自動生成
      companyCode: defaultValues.companyCode,
      officeCode: defaultValues.officeCode,
      name: row.name || row['商品名'] || '',
      category: row.category || row['カテゴリー'] || '',
      maker: row.maker || row['メーカー'] || '',
      model: row.model || row['型番'] || '',
      price: parseNumber(row.price || row['単価'] || row['価格']),
      stock: parseNumber(row.stock || row['在庫'] || row['数量']),
      unit: row.unit || row['単位'] || '個',
      description: row.description || row['説明'] || '',
      createdAt: null,  // 自動生成
      updatedAt: null   // 自動生成
    };
    
    items.push(item);
  });
  
  return items;
}

// ============================================
// グローバル公開
// ============================================
window.CSVUtils = {
  parseCSVLine,
  normalizeText,
  parseNumber,
  parseCSV,
  readCSVFile,
  validateItemData,
  csvToItems
};
