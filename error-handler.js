// グローバルエラーハンドラー
(function() {
    // エラーログを保存
    const ERROR_LOG_KEY = 'error.logs';
    const MAX_ERROR_LOGS = 100;

    // エラーログを追加
    function addErrorLog(error) {
        try {
            const logs = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
            const errorLog = {
                timestamp: new Date().toISOString(),
                message: error.message || String(error),
                stack: error.stack || '',
                url: window.location.href,
                userAgent: navigator.userAgent,
                userId: (() => {
                    try {
                        const user = JSON.parse(sessionStorage.getItem('currentUser'));
                        return user?.userId || 'unknown';
                    } catch {
                        return 'unknown';
                    }
                })()
            };

            logs.unshift(errorLog);
            
            // 最大100件まで保存
            if (logs.length > MAX_ERROR_LOGS) {
                logs.splice(MAX_ERROR_LOGS);
            }

            localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(logs));
        } catch (e) {
            console.error('エラーログの保存に失敗:', e);
        }
    }

    // エラートースト表示
    function showErrorToast(message, duration = 5000) {
        // 既存のトーストを削除
        const existingToast = document.getElementById('globalErrorToast');
        if (existingToast) {
            existingToast.remove();
        }

        // トースト作成
        const toast = document.createElement('div');
        toast.id = 'globalErrorToast';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc2626;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
            z-index: 10000;
            max-width: 400px;
            font-size: 14px;
            line-height: 1.5;
            animation: slideInRight 0.3s ease-out;
            display: flex;
            align-items: flex-start;
            gap: 12px;
        `;

        toast.innerHTML = `
            <div style="flex-shrink: 0; font-size: 20px;"></div>
            <div style="flex: 1;">
                <div style="font-weight: 600; margin-bottom: 4px;">エラーが発生しました</div>
                <div style="font-size: 13px; opacity: 0.95;">${message}</div>
            </div>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; line-height: 1; padding: 0; margin-left: 8px;">×</button>
        `;

        // アニメーション定義
        if (!document.getElementById('errorToastAnimation')) {
            const style = document.createElement('style');
            style.id = 'errorToastAnimation';
            style.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        // 自動削除
        setTimeout(() => {
            if (toast && toast.parentElement) {
                toast.style.animation = 'slideInRight 0.3s ease-out reverse';
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }

    // グローバルエラーハンドラー
    window.addEventListener('error', function(event) {
        console.error('グローバルエラー:', event.error);
        addErrorLog(event.error || new Error(event.message));
        
        // 重大なエラーのみトースト表示
        if (event.error && event.error.message) {
            showErrorToast(event.error.message);
        }
    });

    // Promise rejection エラー
    window.addEventListener('unhandledrejection', function(event) {
        console.error('未処理のPromise拒否:', event.reason);
        addErrorLog(event.reason || new Error('Promise rejected'));
        
        if (event.reason && event.reason.message) {
            showErrorToast(event.reason.message);
        }
    });

    // 公開API
    window.ErrorHandler = {
        // エラーログ取得
        getLogs: function() {
            try {
                return JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
            } catch {
                return [];
            }
        },
        
        // エラーログクリア
        clearLogs: function() {
            localStorage.removeItem(ERROR_LOG_KEY);
        },
        
        // エラートースト表示（手動）
        showError: function(message, duration) {
            showErrorToast(message, duration);
        },
        
        // 成功トースト表示
        showSuccess: function(message, duration = 3000) {
            const existingToast = document.getElementById('globalSuccessToast');
            if (existingToast) {
                existingToast.remove();
            }

            const toast = document.createElement('div');
            toast.id = 'globalSuccessToast';
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #10b981;
                color: white;
                padding: 16px 24px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
                z-index: 10000;
                max-width: 400px;
                font-size: 14px;
                line-height: 1.5;
                animation: slideInRight 0.3s ease-out;
                display: flex;
                align-items: center;
                gap: 12px;
            `;

            toast.innerHTML = `
                <div style="flex-shrink: 0; font-size: 20px;"></div>
                <div style="flex: 1;">${message}</div>
                <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; line-height: 1; padding: 0;">×</button>
            `;

            document.body.appendChild(toast);

            setTimeout(() => {
                if (toast && toast.parentElement) {
                    toast.style.animation = 'slideInRight 0.3s ease-out reverse';
                    setTimeout(() => toast.remove(), 300);
                }
            }, duration);
        },
        
        // 警告トースト表示
        showWarning: function(message, duration = 4000) {
            const existingToast = document.getElementById('globalWarningToast');
            if (existingToast) {
                existingToast.remove();
            }

            const toast = document.createElement('div');
            toast.id = 'globalWarningToast';
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #f59e0b;
                color: white;
                padding: 16px 24px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
                z-index: 10000;
                max-width: 400px;
                font-size: 14px;
                line-height: 1.5;
                animation: slideInRight 0.3s ease-out;
                display: flex;
                align-items: center;
                gap: 12px;
            `;

            toast.innerHTML = `
                <div style="flex-shrink: 0; font-size: 20px;"></div>
                <div style="flex: 1;">${message}</div>
                <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; line-height: 1; padding: 0;">×</button>
            `;

            document.body.appendChild(toast);

            setTimeout(() => {
                if (toast && toast.parentElement) {
                    toast.style.animation = 'slideInRight 0.3s ease-out reverse';
                    setTimeout(() => toast.remove(), 300);
                }
            }, duration);
        }
    };
})();
