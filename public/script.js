document.addEventListener('DOMContentLoaded', () => {
    const webUrlInput = document.getElementById('webUrlInput');
    const getLinkBtn = document.getElementById('getLinkBtn');
    const loader = document.getElementById('loader');
    const resultArea = document.getElementById('resultArea');
    const errorArea = document.getElementById('errorArea');

    getLinkBtn.addEventListener('click', async () => {
        const webUrl = webUrlInput.value.trim();
        if (!webUrl) {
            showError('请输入有效的 URL');
            return;
        }

        // Reset UI
        getLinkBtn.disabled = true;
        loader.style.display = 'block';
        resultArea.innerHTML = '';
        resultArea.style.display = 'none';
        errorArea.innerHTML = '';
        errorArea.style.display = 'none';

        try {
            const response = await fetch('/api/get-m3u8', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ web_url: webUrl }),
            });

            const data = await response.json();

            if (response.ok) {
                showResult(data.title, data.m3u8Url);
            } else {
                showError(data.error || '发生未知错误');
            }
        } catch (err) {
            showError('请求失败，请检查网络或联系管理员。');
        }

        // Restore UI
        getLinkBtn.disabled = false;
        loader.style.display = 'none';
    });

    function showResult(title, m3u8Url) {
        resultArea.style.display = 'block';
        resultArea.innerHTML = `
            <p><strong>视频标题:</strong> ${escapeHtml(title)}</p>
            <p><strong>M3U8 链接:</strong> <a href="${escapeHtml(m3u8Url)}" target="_blank">${escapeHtml(m3u8Url)}</a></p>
        `;
    }

    function showError(message) {
        errorArea.style.display = 'block';
        errorArea.innerText = message;
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
