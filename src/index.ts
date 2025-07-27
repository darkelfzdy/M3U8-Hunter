import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import puppeteer from '@cloudflare/puppeteer';

export interface Env {
    BROWSER: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

// Serve static frontend files
app.get('/*', serveStatic({ root: './public' }));

// API endpoint to get M3U8 link
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

        page.on('request', (request: any) => {
            const url = request.url();
            if (url.includes('.m3u8')) {
                m3u8Url = url;
                page.off('request'); // Stop listening once found
            }
        });

        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844, isMobile: true });

        await page.goto(web_url, { waitUntil: 'networkidle2', timeout: 55000 });

        let videoTitle = await page.title();
        videoTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_');

        if (!m3u8Url) {
            console.log('M3U8 not found on initial load. Trying to interact...');
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
            await new Promise(resolve => setTimeout(resolve, 4000));
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