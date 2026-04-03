/**
 * アップロード制限管理
 * OCRコスト保護・悪用防止のため、1日のアップロード回数を制限
 */

const LIMITS = {
    maxUploadPerDay: 10,        // 1日のアップロード回数
    maxFilesPerUpload: 5,       // 1回のアップロードファイル数
    maxFileSizeMB: 20,          // 1ファイルの最大サイズ（MB）
};

/**
 * 今日のアップロード回数を取得
 * @returns {number} 今日のアップロード回数
 */
function getUploadCountToday() {
    try {
        const lastUploadDate = demoGetFromLocalStorage('limit.uploadDate');
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // 日付が変わっていたらカウントリセット
        if (lastUploadDate !== today) {
            demoSaveToLocalStorage('limit.uploadCountToday', '0');
            demoSaveToLocalStorage('limit.uploadDate', today);
            return 0;
        }

        const count = parseInt(demoGetFromLocalStorage('limit.uploadCountToday') || '0', 10);
        return count;
    } catch (e) {
        console.error('[UploadLimits] getUploadCountToday error:', e);
        return 0;
    }
}

/**
 * アップロード回数をカウント
 */
function incrementUploadCount() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentCount = getUploadCountToday();
        
        demoSaveToLocalStorage('limit.uploadCountToday', String(currentCount + 1));
        demoSaveToLocalStorage('limit.uploadDate', today);
        
    } catch (e) {
        console.error('[UploadLimits] incrementUploadCount error:', e);
    }
}

/**
 * アップロード可能か判定
 * @param {number} fileCount - アップロードするファイル数
 * @returns {Object} { canUpload: boolean, reason: string }
 */
function canUpload(fileCount = 1) {
    try {
        // 1日の上限チェック
        const currentCount = getUploadCountToday();
        if (currentCount >= LIMITS.maxUploadPerDay) {
            return {
                canUpload: false,
                reason: `1日のアップロード上限（${LIMITS.maxUploadPerDay}回）に達しています。明日またお試しください。`
            };
        }

        // ファイル数チェック
        if (fileCount > LIMITS.maxFilesPerUpload) {
            return {
                canUpload: false,
                reason: `一度にアップロードできるファイルは${LIMITS.maxFilesPerUpload}個までです。`
            };
        }

        return {
            canUpload: true,
            reason: ''
        };
    } catch (e) {
        console.error('[UploadLimits] canUpload error:', e);
        return {
            canUpload: false,
            reason: 'エラーが発生しました。'
        };
    }
}

/**
 * 残りアップロード回数を取得
 * @returns {number} 残り回数
 */
function getRemainingUploads() {
    const currentCount = getUploadCountToday();
    const remaining = LIMITS.maxUploadPerDay - currentCount;
    return Math.max(0, remaining);
}

/**
 * ファイルサイズチェック
 * @param {File} file - チェックするファイル
 * @returns {Object} { valid: boolean, reason: string }
 */
function checkFileSize(file) {
    const maxSizeBytes = LIMITS.maxFileSizeMB * 1024 * 1024;
    
    if (file.size > maxSizeBytes) {
        return {
            valid: false,
            reason: `ファイルサイズが大きすぎます（最大${LIMITS.maxFileSizeMB}MB）\nファイル: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`
        };
    }

    return {
        valid: true,
        reason: ''
    };
}

/**
 * アップロード制限情報を取得
 * @returns {Object} 制限情報
 */
function getUploadLimitsInfo() {
    return {
        uploadedToday: getUploadCountToday(),
        remainingToday: getRemainingUploads(),
        maxUploadPerDay: LIMITS.maxUploadPerDay,
        maxFilesPerUpload: LIMITS.maxFilesPerUpload,
        maxFileSizeMB: LIMITS.maxFileSizeMB
    };
}

// グローバルに公開
window.UploadLimits = {
    getUploadCountToday,
    incrementUploadCount,
    canUpload,
    getRemainingUploads,
    checkFileSize,
    getUploadLimitsInfo,
    LIMITS
};

