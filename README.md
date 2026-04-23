# Film Vault

这是一个公开只读、私下维护的电影墙。
当前项目已经兼容两种使用方式：

- 本地双击 `index.html` 直接预览，并用本地管理员模式维护
- 部署到 Cloudflare Pages 后，通过 `_worker.js` 提供受保护的管理接口

## 数据结构

- `data/library.json`
  主要维护电影名和年份；搜索脚本会自动补充可选 `tmdbId`，用于解决重名电影。
- `data/library.resolved.json`
  给前端站点直接使用的静态数据，包含海报、简介、演员、评分等完整字段。
- `data/library.source.js` / `data/library.resolved.js`
  为了兼容直接双击 `index.html` 的本地打开方式，前端优先读取这两个静态 JS 数据文件。

## 本地打开

- 现在支持直接双击 `index.html`
- 页面优先从 `data/library.source.js` 和 `data/library.resolved.js` 读取数据，所以不依赖本地 HTTP 服务
- 每次执行重建脚本时，这两个文件会自动同步更新

## 本地维护

1. 在项目根目录创建 `.dev.vars`
2. 写入：

```env
TMDB_API_KEY=你的密钥
```

3. 按电影名搜索并添加：

```bash
npm run add:movie -- 霸王别姬
```

4. 或者在改完 `data/library.json` 后重新生成静态数据：

```bash
npm run rebuild:library
```

## 部署

- 前端页面会优先读取 Cloudflare `/api/library`
- 当远程接口不可用时，自动回退到本地 `data/library.resolved.json`
- 不在浏览器里暴露密钥
- 兼容 Cloudflare Pages / Workers 静态部署

## 页面内搜索添加

- 页面内搜索添加在两种场景可用：
- 本地双击预览时，使用未提交的 `admin.local.js`
- 部署到 Cloudflare 后，使用管理员登录进入远程管理模式
- 根目录放一个不提交到 Git 的 `admin.local.js`
- 示例文件见 `admin.local.example.js`

```js
window.FILM_VAULT_ADMIN = {
  apiKey: "你的密钥"
};
```

- 双击打开 `index.html` 后，右上角会出现“搜索添加 / 导出片单 / 导出完整数据”
- 添加结果会先保存到浏览器本地草稿，并在刷新后保留
- 你可以直接从页面导出新的 `library.json` 和 `library.resolved.json`

## Cloudflare 部署

- 项目根目录的 `_worker.js` 提供 Cloudflare Pages 高级模式接口
- 公开访问时，站点仍然只读
- 只有管理员登录后，才可以在页面内搜索并添加电影

### 需要配置的 Cloudflare 项

1. 复制 `wrangler.example.toml` 为 `wrangler.toml`
2. 创建一个 KV namespace，并绑定为 `FILM_VAULT_KV`
3. 在 Cloudflare Pages / Workers 里配置以下 Secrets

```text
TMDB_API_KEY
ADMIN_PASSWORD
SESSION_SECRET
```

### 数据写入方式

- 首次部署时，公开页面会先读取仓库里的静态 `data/library.*`
- 第一次通过管理员模式添加电影时，Worker 会自动把当前片库写入 KV
- 此后线上站点优先读取 KV 中的片库数据

### 推荐本地预览方式

- 纯静态预览：直接双击 `index.html`
- Cloudflare 管理预览：使用 `wrangler pages dev .`

## GitHub secrets

- 不要把 `.dev.vars`、`.env*` 提交到仓库
- 如果要在 GitHub Actions 里自动生成 `data/library.resolved.json`，把 `TMDB_API_KEY` 配置为仓库 Secret
- 仓库已经附带 `.github/workflows/rebuild-library.yml`

## 只让你自己使用搜索添加

- 当前实现采用“双轨维护”模式
- 本地可直接双击打开并使用本地管理员模式
- Cloudflare 上线后，只有通过管理员密码鉴权，才可以调用搜索和添加接口
- 公开访客仍然只能浏览和搜索你已经看过的电影
