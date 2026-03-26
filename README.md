# 📖 Markdown Reader

一个简洁、美观的 Markdown 在线阅读器，基于 Cloudflare Workers 全栈部署。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Cloudflare Workers](https://img.shields.io/badge/deploy-Cloudflare%20Workers-orange.svg)

## ✨ 特性

- 🔗 **URL 读取** - 通过 `?url=https://example.com/readme.md` 直接访问
- 📁 **文件上传** - 拖拽上传本地 Markdown 文件
- 📋 **粘贴渲染** - 直接粘贴 Markdown 文本即时预览
- 📑 **自动生成目录** - 侧边栏目录，点击快速跳转
- 🎨 **主题切换** - 支持亮色/暗色主题
- 📱 **响应式设计** - 适配桌面和移动端
- 🔒 **隐私安全** - 纯前端渲染，内容不上传第三方服务器
- ⚡ **边缘加速** - Cloudflare Workers 全球 300+ 节点加速

## 🚀 一键部署

### 前提
- Cloudflare 账号（免费）
- 已安装 Node.js

### 部署步骤

```bash
# 1. 进入项目目录
cd markdown-reader

# 2. 复制配置文件
cp wrangler.toml.example wrangler.toml

# 3. 编辑 wrangler.toml，修改为你的域名
# routes = [{ pattern = "markdown.YOUR_DOMAIN.com/*", custom_domain = true }]

# 4. 安装 wrangler 并登录
npm install -g wrangler
wrangler login

# 5. 部署
wrangler deploy
```

部署完成后，访问你的域名即可使用！

## 📖 使用方法

### 通过 URL 访问文档

```
https://markdown.chathappy.cn/?url=https://raw.githubusercontent.com/user/repo/main/README.md
```

### 界面操作

| 操作 | 方式 |
|------|------|
| 输入 URL | 顶部输入框粘贴链接，回车 |
| 上传文件 | 点击"上传文件"或拖拽文件到页面 |
| 粘贴内容 | 首页文本框粘贴 Markdown 后点击"渲染" |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + O` | 打开文件选择 |
| `Ctrl/Cmd + L` | 聚焦到 URL 输入框 |

## 🏗️ 项目结构

```
markdown-reader/
├── worker.js               # Cloudflare Worker (前端 + API)
├── index.html              # 前端页面 (被 worker.js 内嵌)
├── wrangler.toml.example   # 配置模板
├── README.md               # 本文件
└── LICENSE                 # MIT 许可证
```

## 🔧 高级配置

### 限制可代理的域名

编辑 `worker.js`，取消注释以下代码：

```javascript
const allowedDomains = env.ALLOWED_DOMAINS?.split(',') || [];
if (allowedDomains.length > 0 && !allowedDomains.includes(parsedUrl.hostname)) {
  return jsonResponse({ error: 'Domain not allowed' }, 403);
}
```

然后在 `wrangler.toml` 添加：

```toml
[vars]
ALLOWED_DOMAINS = "github.com,raw.githubusercontent.com,gitee.com"
```

### 配置自定义域名

编辑 `wrangler.toml`：

```toml
routes = [
  { pattern = "markdown.chathappy.cn/*", custom_domain = true }
]
```

确保你的域名 DNS 已指向 Cloudflare。

## 📝 API 接口

### 代理获取 Markdown

```
GET /proxy?url=https://example.com/readme.md
```

**响应**: 纯文本 Markdown 内容

### 健康检查

```
GET /health
```

**响应**:
```json
{ "status": "ok", "version": "1.0.0" }
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建分支 (`git checkout -b feature/amazing`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing`)
5. 创建 Pull Request

## 📄 许可证

[MIT](LICENSE) © Markdown Reader Contributors

## 🙏 致谢

- [Marked](https://marked.js.org/) - Markdown 解析器
- [highlight.js](https://highlightjs.org/) - 代码高亮
- [github-markdown-css](https://github.com/sindresorhus/github-markdown-css) - GitHub 风格样式
- [DOMPurify](https://github.com/cure53/DOMPurify) - XSS 防护

---

如果这个项目对你有帮助，欢迎 ⭐ Star 支持！
