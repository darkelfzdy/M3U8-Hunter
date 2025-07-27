import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import puppeteer from '@cloudflare/puppeteer';

export interface Env {
    BROWSER: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/*', serveStatic({ root: './public' }));

app.post('/api/get-m3u8', async (c) => {
    let browser: any = null;
    try {
        const { web_url } = await c.req.json<{ web_url: string }>();
        if (!web_url || !web_url.startsWith('http')) {
            return c.json({ error: '无效的 URL' }, 400);
        }

        browser = await puppeteer.launch(c.env.BROWSER);
        const page = await browser.newPage();

        let m3u8Url: string | null = null;

        // 这个监听器依然是我们捕获 URL 的主要方式，保持不变
        page.on('request', (request: any) => {
            const url = request.url();
            if (url.includes('.m3u8')) {
                console.log(`M3U8 URL found by listener: ${url}`);
                m3u8Url = url;
            }
        });

        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844, isMobile: true });

        // 我们仍然使用 networkidle2 来完成初始加载，避免页面本身超时
        await page.goto(web_url, { waitUntil: 'networkidle2', timeout: 45000 });

        let videoTitle = await page.title();
        videoTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_');

        // 如果在初始加载后，m3u8 链接仍未被捕获到
        if (!m3u8Url) {
            console.log('M3U8 not found on initial load. Interacting and waiting smartly...');
            
            // 尝试点击播放按钮
            const videoSelectors = ['video', '.video-player', '#player', '.player', '.play-button', 'div[class*="play"]'];
            await page.evaluate((selectors) => {
                for (const selector of selectors) {
                    const el = document.querySelector(selector) as HTMLElement;
                    if (el) {
                        el.click();
                        return;
                    }
                }
            }, videoSelectors);

            // --- 关键修改：用智能等待替换固定等待 ---
            // 我们不再使用 setTimeout(resolve, 4000)。
            // 而是明确告诉 Puppeteer，请等待一个 URL 包含 ".m3u8" 的请求。
            // 我们给这个等待设置一个独立的超时，比如 15 秒。
            try {
                console.log('Waiting specifically for M3U8 request after click...');
                await page.waitForRequest(request => request.url().includes('.m3u8'), { timeout: 15000 });
                console.log('waitForRequest successfully found the M3U8 request.');
            } catch (e) {
                // 如果在 15 秒内依然没有等到 .m3u8 请求，就记录一个日志，然后继续向下执行。
                // 此时 m3u8Url 变量依然是 null。
                console.log('Timed out waiting for M3U8 request after interaction.');
            }
        }

        if (m3u8Url) {
            return c.json({ title: videoTitle, m3u8Url });
        } else {
            return c.json({ error: '未找到 M3U8 链接。请确认该页面有视频或尝试其他页面。' }, 404);
        }

    } catch (error: any) {
        console.error('抓取错误:', error);
        return c.json({ error: `抓取过程中发生错误: ${error.message}` }, 500);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

export default app;