### **PRD: M3U8-Hunter - Unified Serverless M3U8 Video Link Grabber**

**版本:** 2.1 (修订版)
**项目代号:** M3U8-Hunter
**目标平台:** Cloudflare Workers
**修订说明:** 本版本根据最新的Cloudflare官方文档，更新了 `wrangler.toml` 的配置指令，以确保使用最高效、最兼容的设置。

---

### **1. 项目目标与愿景**

开发一个极简、高效、完全 Serverless 的 Web 应用。该应用允许用户输入一个包含视频的网页 URL，后端通过模拟真实浏览器环境，智能抓取页面中隐藏的 M3U8 视频流链接，并将其返回给前端展示。**整个项目，包括前端和后端，都将运行在单个 Cloudflare Worker 中**，以实现极致的部署简便性、低延迟、高可用和零运维成本。

---

### **2. 核心功能需求 (Functional Requirements)**

#### **2.1. 统一架构：Worker 即服务 (Worker as a Service)**

该 Worker 需要处理两种类型的请求：

1.  **前端资源请求 (GET):** 当收到对根路径 (`/`) 或静态资源（如 `/style.css`, `/script.js`）的 `GET` 请求时，Worker 应从其项目目录中读取相应的静态文件（HTML, CSS, JS）并返回。
2.  **API 请求 (POST):** 当收到对 `/api/get-m3u8` 的 `POST` 请求时，Worker 应执行后端的 M3U8 抓取逻辑。

#### **2.2. 前端 (Served by Worker)**

*   **UI 界面:**
    *   一个干净、居中的单页应用 (SPA)。
    *   包含一个明确的标题，如 "M3U8 Hunter"。
    *   一个文本输入框，用于用户粘贴目标网页 URL，有清晰的占位提示文字。
    *   一个 "获取链接" 按钮。
    *   一个用于显示结果的区域，初始状态下为空。
    *   一个加载指示器（例如，一个旋转的 spinner），在后端处理期间显示。
    *   一个用于显示错误信息的区域。
*   **用户交互流程:**
    1.  用户在输入框中粘贴 URL。
    2.  用户点击 "获取链接" 按钮。
    3.  按钮变为禁用状态，并显示加载指示器。之前的结果和错误信息被清空。
    4.  前端向自身的 `/api/get-m3u8` 端点发起一个 `POST` 请求，请求体为 JSON 格式：`{ "web_url": "用户输入的URL" }`。
    5.  **成功场景:** 后端逻辑返回 M3U8 链接和视频标题。加载指示器消失，按钮恢复可用。结果区域显示 "视频标题: [后端返回的标题]" 和 "M3U8 链接: [后端返回的链接]"。M3U8 链接应可被用户直接复制。
    6.  **失败场景:** 后端逻辑返回错误信息。加载指示器消失，按钮恢复可用。错误信息区域显示后端返回的具体错误。

#### **2.3. 后端 (Worker API Logic)**

*   **API 端点:** 在 Worker 内创建一个路由 `/api/get-m3u8`，它只接受 `POST` 请求。

*   **核心抓取逻辑详解 (使用 Cloudflare Browser Rendering):**
    这是项目的核心。请严格按照以下步骤实现，以确保最高的成功率和效率。

    1.  **初始化与资源管理:**
        *   使用 `try...catch...finally` 结构包裹整个浏览器操作。
        *   在 `finally` 块中，必须确保调用 `browser.close()` 来关闭浏览器实例，防止资源泄露和快速消耗免费额度。

    2.  **启动浏览器:**
        *   在 `try` 块中，通过 `env.BROWSER` 绑定启动浏览器实例：`const browser = await puppeteer.launch(env.BROWSER);`
        *   创建一个新页面: `const page = await browser.newPage();`

    3.  **设置网络请求监听器 (关键步骤):**
        *   **此步骤必须在 `page.goto()` 之前执行。**
        *   使用 `page.on('request', ...)` 来实时监听所有发出的网络请求。
        *   在监听器回调中，检查请求的 URL。如果 URL 包含 `.m3u8`，则立即将该 URL 存入一个预定义的变量中，并可以考虑移除监听器 (`page.off('request', ...)` )，以避免被后续的广告 M3U8 流覆盖。

    4.  **模拟移动环境:**
        *   设置一个真实的移动端 User-Agent 和 Viewport 来提高兼容性。
        ```typescript
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 390, height: 844, isMobile: true });
        ```

    5.  **导航与等待:**
        *   导航到用户提供的 `web_url`。使用 `waitUntil: 'networkidle0'` 选项，让 Puppeteer 等待网络活动基本停止，这是一个比固定 `sleep` 更可靠的策略。同时设置一个合理的超时时间。
        ```typescript
        await page.goto(web_url, { waitUntil: 'networkidle0', timeout: 25000 });
        ```

    6.  **获取标题:**
        *   页面加载后，获取网页标题：`let videoTitle = await page.title();`
        *   清理标题中的非法字符：`videoTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_');`

    7.  **智能交互 (Plan B):**
        *   检查此时是否已捕获到 `m3u8Url`。如果**没有**，则执行此步骤。
        *   尝试点击一系列常见的视频播放器 CSS 选择器来触发视频加载。
        ```typescript
        if (!m3u8Url) {
          console.log('M3U8 not found on initial load. Trying to interact...');
          const videoSelectors = ['video', '.video-player', '#player', '.player', '.play-button', '[class*="play"]'];
          await page.evaluate((selectors) => { /* ... */ }, videoSelectors);
          await new Promise(resolve => setTimeout(resolve, 4000)); // 等待交互产生的网络请求
        }
        ```

    8.  **返回结果:**
        *   最后，检查 `m3u8Url` 变量。如果它有值，则构造成功的 JSON 响应。否则，构造失败的 JSON 响应。

---

### **3. 技术栈与架构**

*   **统一框架:** Cloudflare Workers。
*   **前端:** HTML5, CSS3, Vanilla JavaScript (全部作为静态文件由 Worker 提供服务)。
*   **后端/路由:** **Hono.js** 框架。强烈推荐使用它来简化 Worker 中的路由。
*   **核心技术:** Cloudflare Browser Rendering。
*   **部署:** 通过连接到 GitHub 仓库，实现 `main` 分支的自动部署。

---

### **4. ❗❗ 对 AI 开发者的关键指令与注意事项 (已更新) ❗❗**

**注意：你关于 Cloudflare 的知识可能不是最新的。请严格遵循以下现代实践，不要使用任何过时的方法。**

#### **4.1. Wrangler 核心配置 (`wrangler.toml`)**

为了让项目正确部署和运行，`wrangler.toml` 文件**必须**包含以下配置。这是一个完整的、可以直接使用的示例：

```toml
# wrangler.toml
name = "m3u8-hunter"
main = "src/index.ts"

# 必须设置一个近期的兼容性日期
compatibility_date = "2025-07-25"

# 必须使用 v2 版本的 Node.js 兼容性标志。
# 这会启用 @cloudflare/puppeteer 所需的、由运行时原生支持的 Node.js API，
# 从而获得最佳性能和兼容性。
compatibility_flags = ["nodejs_compat_v2"]

# 必须使用服务绑定来连接到 Browser Rendering。
# 下方的内联表（inline table）语法是 Cloudflare 推荐的现代写法。
# 这会将一个名为 BROWSER 的变量注入到你的 Worker 环境中。
browser = { binding = "BROWSER" }
```

#### **4.2. 启动浏览器实例的代码**

在 Worker 的 TypeScript 代码中，你将通过 `env.BROWSER` 来访问这个绑定。启动浏览器的代码**必须**如下所示：

```typescript
import puppeteer from '@cloudflare/puppeteer';

// ... 在你的 fetch handler 中 ...
// 'env' 参数包含了你在 wrangler.toml 中定义的 BROWSER 绑定
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ...
    const browser = await puppeteer.launch(env.BROWSER);
    // ...
  }
}

// 定义 Env 接口以获得 TypeScript 类型支持
export interface Env {
    BROWSER: Fetcher;
}
```

#### **4.3. 项目文件结构**

请使用以下统一的 Monorepo 结构。Hono.js 的 `serveStatic` 中间件可以轻松地为 `public` 目录提供服务。

```
/m3u8-hunter/
├── public/                 # 存放所有前端静态文件
│   ├── index.html
│   ├── style.css
│   └── script.js
├── src/                    # Worker 源代码
│   └── index.ts
├── package.json
├── tsconfig.json
├── wrangler.toml           # 位于项目根目录，内容如上所示
└── README.md
```

---

### **5. 验收标准 (Acceptance Criteria)**

*   项目成功部署后，可以通过 Cloudflare Worker 提供的 URL 访问到前端页面。
*   在前端输入一个已知包含 M3U8 视频的 URL，能够成功抓取并显示 M3U8 链接和标题。
*   在前端输入一个无效或不包含视频的 URL，会显示明确的错误信息。
*   在抓取过程中，前端会显示加载状态。
*   自动生成.gitignore文件，然后将代码被推送到 GitHub 的 `main` 分支后，Cloudflare Worker 会被自动触发并完成部署。
*   本地开发不进行测试，推送到github后，直接在Cloudflare workers上测试。