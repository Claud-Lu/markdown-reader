# 📖 Markdown Reader

一个简洁、美观的 Markdown 在线阅读器，支持 URL 读取、文件上传、粘贴渲染等多种方式。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Cloudflare Workers](https://img.shields.io/badge/deploy-Cloudflare%20Workers-orange.svg)

## ✨ 特性

- 🔗 **URL 读取** - 直接通过 URL 参数 `?url=https://example.com/readme.md` 访问
- 📁 **文件上传** - 支持拖拽上传本地 Markdown 文件
- 📋 **粘贴渲染** - 直接粘贴 Markdown 文本即时预览
- 📑 **自动生成目录** - 根据标题生成侧边栏目录，点击快速跳转
- 🎨 **主题切换** - 支持亮色/暗色主题
- 📱 **响应式设计** - 适配桌面和移动端
- 🔒 **隐私保护** - 纯前端渲染，文件内容不上传到服务器
- ⚡ **边缘加速** - 可选 Cloudflare Workers 代理，全球快速访问

## 🚀 快速开始

### 方式一：直接使用（静态托管）

1. 下载 `index.html`
2. 上传到任意静态托管服务（Vercel、Netlify、GitHub Pages、Cloudflare Pages 等）
3. 访问页面即可使用

**支持 CORS 的源可直接读取：**
```
https://your-site.com/?url=https://raw.githubusercontent.com/user/repo/main/README.md
```

### 方式二：完整部署（推荐）

#### 1. 部署 Cloudflare Worker 代理

```bash
# 安装 wrangler
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 克隆项目
git clone https://github.com/yourname/markdown-reader.git
cd markdown-reader

# 复制配置文件
cp wrangler.toml.example wrangler.toml

# 部署
wrangler deploy
```

#### 2. 配置前端

编辑 `index.html`，设置你的 Worker URL：

```javascript
const WORKER_URL = 'https://markdown-reader.your-name.workers.dev';
```

#### 3. 绑定自定义域名（可选）

在 Cloudflare Dashboard 中：
1. Workers & Pages → 你的 Worker → Settings → Triggers
2. 点击 "Add Custom Domain"
3. 输入 `markdown.chathappy.cn`

## 📖 使用方法

### URL 参数

```
https://markdown.chathappy.cn/?url=https://raw.githubusercontent.com/user/repo/main/README.md
```

### 界面操作

| 操作 | 方式 |
|------|------|
| 输入 URL | 顶部输入框直接粘贴链接 |
| 上传文件 | 点击"上传文件"按钮或拖拽到页面 |
| 粘贴内容 | 在首页文本框粘贴 Markdown |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + O` | 打开文件选择 |
| `Ctrl/Cmd + L` | 聚焦到 URL 输入框 |

## 🏗️ 项目结构

```
markdown-reader/
├── index.html              # 前端页面（纯静态，可独立使用）
├── worker.js               # Cloudflare Worker 代理脚本
├── wrangler.toml.example   # Worker 配置模板
├── themes/                 # 主题样式（可选）
├── README.md               # 本文件
└── LICENSE                 # MIT 许可证
```

## 🔧 高级配置

### 限制访问域名

编辑 `worker.js`，取消以下注释并配置：

```javascript
const allowedDomains = env.ALLOWED_DOMAINS?.split(',') || [];
if (allowedDomains.length > 0 && !allowedDomains.includes(parsedUrl.hostname)) {
  return new Response(JSON.stringify({ error: 'Domain not allowed' }), ...);
}
```

在 `wrangler.toml` 中添加：

```toml
[vars]
ALLOWED_DOMAINS = "github.com,raw.githubusercontent.com"
```

### 启用缓存

如需缓存频繁访问的文档，可配置 KV：

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"
```

然后在 `worker.js` 中实现缓存逻辑。

## 🛠️ 本地开发

```bash
# 启动本地服务器
npx serve .

# 或使用 Python
python3 -m http.server 8080

# 访问 http://localhost:8080
```

## 📝 支持的格式

- `.md` - Markdown 文件
- `.markdown` - Markdown 文件
- `.txt` - 纯文本文件
- 任何包含 Markdown 语法的文本内容

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建你的分支 (`git checkout -b feature/amazing`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing`)
5. 创建 Pull Request

## 📄 许可证

[MIT](LICENSE) © [Your Name](https://github.com/yourname)

## 🙏 致谢

- [Marked](https://marked.js.org/) - Markdown 解析器
- [highlight.js](https://highlightjs.org/) - 代码高亮
- [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) - GitHub 风格样式
- [DOMPurify](https://github.com/cure53/DOMPurify) - XSS 防护

---

如果这个项目对你有帮助，欢迎 ⭐ Star 支持！
