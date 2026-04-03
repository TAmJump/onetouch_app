// グローバルローディングスピナー
(function() {
    let loadingCount = 0;
    let loadingElement = null;

    // ローディング表示
    function showLoading(message = '読み込み中...') {
        loadingCount++;

        if (!loadingElement) {
            loadingElement = document.createElement('div');
            loadingElement.id = 'globalLoadingOverlay';
            loadingElement.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.2s ease-out;
            `;

            loadingElement.innerHTML = `
                <div style="background: white; padding: 32px 48px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); text-align: center;">
                    <div class="spinner" style="width: 48px; height: 48px; border: 4px solid #f3f4f6; border-top: 4px solid #9B2335; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
                    <div id="loadingMessage" style="font-size: 16px; color: #333; font-weight: 500;">${message}</div>
                </div>
            `;

            // アニメーション定義
            if (!document.getElementById('loadingAnimation')) {
                const style = document.createElement('style');
                style.id = 'loadingAnimation';
                style.textContent = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(loadingElement);
        } else {
            // メッセージ更新
            const messageElement = document.getElementById('loadingMessage');
            if (messageElement) {
                messageElement.textContent = message;
            }
        }
    }

    // ローディング非表示
    function hideLoading() {
        loadingCount--;

        if (loadingCount <= 0) {
            loadingCount = 0;
            if (loadingElement) {
                loadingElement.remove();
                loadingElement = null;
            }
        }
    }

    // 進捗バー付きローディング
    function showLoadingWithProgress(message = '処理中...', total = 100) {
        showLoading(message);
        
        const loadingDiv = loadingElement.querySelector('div > div');
        
        // 進捗バー追加
        if (!document.getElementById('loadingProgressBar')) {
            const progressContainer = document.createElement('div');
            progressContainer.id = 'loadingProgressContainer';
            progressContainer.style.cssText = 'margin-top: 16px;';
            
            progressContainer.innerHTML = `
                <div style="background: #f3f4f6; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                    <div id="loadingProgressBar" style="background: #9B2335; height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
                <div id="loadingProgressText" style="font-size: 13px; color: #666;">0%</div>
            `;
            
            loadingDiv.appendChild(progressContainer);
        }

        return {
            update: function(current) {
                const percentage = Math.min(Math.round((current / total) * 100), 100);
                const progressBar = document.getElementById('loadingProgressBar');
                const progressText = document.getElementById('loadingProgressText');
                
                if (progressBar) {
                    progressBar.style.width = percentage + '%';
                }
                if (progressText) {
                    progressText.textContent = percentage + '%';
                }
            },
            setMessage: function(newMessage) {
                const messageElement = document.getElementById('loadingMessage');
                if (messageElement) {
                    messageElement.textContent = newMessage;
                }
            },
            close: hideLoading
        };
    }

    // 公開API
    window.Loading = {
        show: showLoading,
        hide: hideLoading,
        withProgress: showLoadingWithProgress
    };
})();
