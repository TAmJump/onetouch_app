/**
 * アカウントメニュー共通コンポーネント
 * ヘッダーにユーザー情報とドロップダウンメニューを表示
 */

// アカウントメニューを表示
function initAccountMenu() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return;

    // メニューHTML
    const menuHTML = `
        <div id="accountMenu" style="position: relative; display: inline-block;">
            <button id="accountMenuBtn" style="
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(255,255,255,0.1);
                border: 1px solid rgba(255,255,255,0.3);
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
            ">
                <div style="
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #9B2335, #7a1c2a);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                    font-size: 14px;
                ">
                    ${currentUser.name ? currentUser.name.charAt(0) : 'U'}
                </div>
                <span>${currentUser.name || 'ユーザー'}</span>
                <span style="font-size: 10px;">▼</span>
            </button>
            
            <div id="accountDropdown" style="
                display: none;
                position: absolute;
                top: 50px;
                right: 0;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                min-width: 200px;
                z-index: 1000;
            ">
                <div style="padding: 16px; border-bottom: 1px solid #f0f0f0;">
                    <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${currentUser.name || 'ユーザー'}</div>
                    <div style="font-size: 12px; color: #666;">${currentUser.companyName || ''}</div>
                    <div style="font-size: 12px; color: #999;">${currentUser.officeName || ''}</div>
                </div>
                <div style="padding: 8px 0;">
                    <a href="notification-settings.html" style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px 16px;
                        color: #333;
                        text-decoration: none;
                        transition: background 0.2s;
                    " onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent'">
                        <span style="font-size: 18px;"></span>
                        <span>通知設定</span>
                    </a>
                    <a href="change-password.html" style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px 16px;
                        color: #333;
                        text-decoration: none;
                        transition: background 0.2s;
                    " onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent'">
                        <span style="font-size: 18px;"></span>
                        <span>パスワード変更</span>
                    </a>
                    <a href="system-settings.html" style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px 16px;
                        color: #333;
                        text-decoration: none;
                        transition: background 0.2s;
                    " onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent'">
                        <span style="font-size: 18px;">️</span>
                        <span>システム設定</span>
                    </a>
                </div>
                <div style="border-top: 1px solid #f0f0f0; padding: 8px 0;">
                    <a href="#" onclick="logoutFromMenu(event)" style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px 16px;
                        color: #c62828;
                        text-decoration: none;
                        transition: background 0.2s;
                    " onmouseover="this.style.background='#ffebee'" onmouseout="this.style.background='transparent'">
                        <span style="font-size: 18px;"></span>
                        <span>ログアウト</span>
                    </a>
                </div>
            </div>
        </div>
    `;

    return menuHTML;
}

// メニューの開閉
function toggleAccountMenu() {
    const dropdown = document.getElementById('accountDropdown');
    if (dropdown.style.display === 'none') {
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}

// 外側をクリックしたらメニューを閉じる
document.addEventListener('click', function(e) {
    const menu = document.getElementById('accountMenu');
    const btn = document.getElementById('accountMenuBtn');
    const dropdown = document.getElementById('accountDropdown');
    
    if (menu && btn && dropdown) {
        if (!menu.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});

// メニューボタンクリック
document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('accountMenuBtn');
    if (btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleAccountMenu();
        });
    }
});

// ログアウト
function logoutFromMenu(e) {
    e.preventDefault();
    const confirmed = confirm('ログアウトしますか？');
    if (!confirmed) return;

    sessionStorage.removeItem('currentUser');
    localStorage.removeItem('currentAccount');
    localStorage.removeItem('ONE_loggedIn');
    localStorage.removeItem('ONE_userId');
    localStorage.removeItem('ONE_userName');
    window.location.href = 'login.html';
}
