# Film Vault

这是一个公开只读、私下维护的电影墙。

## 数据结构

- `data/library.json`
  主要维护电影名和年份；搜索脚本会自动补充可选 `tmdbId`，用于解决重名电影。
- `data/library.resolved.json`
  给前端站点直接使用的静态数据，包含海报、简介、演员、评分等完整字段。

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

## GitHub secrets

- 不要把 `.dev.vars`、`.env*` 提交到仓库
- 如果要在 GitHub Actions 里自动生成 `data/library.resolved.json`，把 `TMDB_API_KEY` 配置为仓库 Secret
- 仓库已经附带 `.github/workflows/rebuild-library.yml`

## 只让你自己使用搜索添加

- 当前实现采用“本地私有维护”模式
- `npm run add:movie -- 电影名` 只在你的本地终端运行，不会暴露给站点访客
- 公开站点继续只读展示，不提供在线增删改入口
- 如果以后你想要“线上也能只有你可添加”，建议在 Cloudflare 上额外给 `/admin` 路径加 Access 保护，再让后台接口用 GitHub Token 回写仓库
