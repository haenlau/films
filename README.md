# Film Vault

这是一个公开只读、私下维护的电影墙。

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

- 前端页面只读取 `data/library.resolved.json`
- 不在浏览器里暴露密钥
- 兼容 Cloudflare Pages / Workers 静态部署

## 页面内搜索添加

- 页面内搜索添加只在本地环境启用，不会出现在公开部署站点
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

## GitHub secrets

- 不要把 `.dev.vars`、`.env*` 提交到仓库
- 如果要在 GitHub Actions 里自动生成 `data/library.resolved.json`，把 `TMDB_API_KEY` 配置为仓库 Secret
- 仓库已经附带 `.github/workflows/rebuild-library.yml`

## 只让你自己使用搜索添加

- 当前实现采用“本地私有维护”模式
- `npm run add:movie -- 电影名` 只在你的本地终端运行，不会暴露给站点访客
- 公开站点继续只读展示，不提供在线增删改入口
- 如果以后你想要“线上也能只有你可添加”，建议在 Cloudflare 上额外给 `/admin` 路径加 Access 保护，再让后台接口用 GitHub Token 回写仓库
