# Film Vault

一个面向个人长期使用的电影墙项目。

它的目标很明确：

- 公开展示你已经看过的电影
- 允许访客搜索和浏览你的片库
- 只有管理员登录后，才可以添加或删除影片
- 支持本地维护，也支持部署到 Cloudflare Pages

## 功能概览

- 电影墙首页展示海报、评分、上映时间、地区、简介、演员等基础信息
- 支持片库搜索、排序、地区筛选、评分筛选、类型筛选
- 管理员登录后可搜索电影并直接加入片库
- 管理员可删除已经添加到片库的电影
- Cloudflare 线上版本通过 KV 持久化片库数据
- 本地双击 `index.html` 也可以直接预览

## 项目结构

```text
.
├─ index.html                 # 页面结构
├─ styles.css                 # 样式
├─ app.js                     # 前端交互逻辑
├─ _worker.js                 # Cloudflare Pages / Workers 管理接口
├─ favicon.svg                # 网站图标
├─ wrangler.example.toml      # Cloudflare 配置模板
├─ admin.local.example.js     # 本地管理员配置模板
├─ data/
│  ├─ library.json            # 源片单（title / year / tmdbId）
│  ├─ library.resolved.json   # 前端完整静态片库
│  ├─ library.source.js       # 本地 file:// 预览使用的数据脚本
│  └─ library.resolved.js     # 本地 file:// 预览使用的数据脚本
└─ scripts/
   ├─ rebuild-library.mjs     # 根据源片单重建完整静态片库
   ├─ add-movie.mjs           # 本地命令行搜索并添加电影
   └─ lib/
      ├─ movie-db.mjs         # 电影数据库请求封装
      └─ library-files.mjs    # 片库文件读写
```

## 获取项目

克隆仓库：

```bash
git clone https://github.com/haenlau/films.git
cd films
```

如果你只是想本地打开预览页面，不需要额外安装依赖。

如果你要运行脚本重建片库，确保本机有 Node.js 18+。

## 本地使用

### 1. 直接预览

直接双击 `index.html` 即可。

为了兼容 `file://` 打开方式，页面会优先读取：

- `data/library.source.js`
- `data/library.resolved.js`

所以即使没有本地 HTTP 服务，也能正常显示片库。

### 2. 启用本地管理员模式

复制模板文件：

```bash
copy admin.local.example.js admin.local.js
```

或手动创建 `admin.local.js`：

```js
window.FILM_VAULT_ADMIN = {
  apiKey: "你的 TMDB API Key",
  password: "你自己的本地管理密码"
};
```

说明：

- `admin.local.js` 不应提交到 Git
- 本地打开页面后，右上角会显示 `登录管理`
- 登录成功后，才会出现 `控制台`
- 控制台里可以执行：
  - `添加影片`
  - `导出片单`
  - `导出数据`

### 3. 本地命令行维护片库

如果你习惯命令行方式维护片库，可以在项目根目录创建 `.dev.vars`：

```env
TMDB_API_KEY=你的密钥
```

然后使用：

按电影名搜索并添加：

```bash
npm run add:movie -- 霸王别姬
```

根据 `data/library.json` 重新生成完整片库：

```bash
npm run rebuild:library
```

## 数据文件说明

### `data/library.json`

这是源片单文件，适合人工维护或脚本维护。

格式示例：

```json
{
  "title": "我的电影墙",
  "subtitle": "一面为私人观影史准备的电影墙。",
  "generatedAt": "2026-04-23T07:21:39.265Z",
  "entries": [
    {
      "title": "黑洞频率",
      "year": 2000,
      "tmdbId": 10559
    }
  ]
}
```

### `data/library.resolved.json`

这是前端直接使用的完整片库数据，包含：

- 海报
- 背景图
- 评分
- 上映时间
- 国家地区
- 类型
- 制作公司
- 演员
- 简介

不要手工维护这个文件，推荐通过脚本生成。

## Cloudflare 部署

推荐使用 **Cloudflare Pages**。

这个项目的结构是：

- 静态站点：`index.html` / `styles.css` / `app.js`
- 服务端接口：`_worker.js`

所以最适合 Pages + Advanced Mode。

### Pages 构建配置

在 Cloudflare Pages 里连接 GitHub 仓库后：

- Framework preset: `None`
- Build command: 留空
- Build output directory: `.`

这个项目不需要传统的前端构建命令。

### Cloudflare 必要配置

#### 1. KV Namespace

创建一个 KV namespace，并绑定为：

```text
FILM_VAULT_KV
```

#### 2. Secrets

在 Pages 项目中配置以下 Secrets：

```text
TMDB_API_KEY
ADMIN_PASSWORD
SESSION_SECRET
```

说明：

- `TMDB_API_KEY`：电影数据库接口密钥
- `ADMIN_PASSWORD`：线上管理员登录密码
- `SESSION_SECRET`：登录态签名密钥

### 线上数据逻辑

线上运行时，Worker 会优先读取 Cloudflare KV 中的片库。

为了避免 KV 一直停留在旧数据，本项目已经实现：

- 静态片库文件带 `generatedAt`
- Worker 会比较静态数据和 KV 数据
- 如果 GitHub 中的静态片库更新，就会自动刷新 KV

所以正常情况下：

1. 你修改仓库中的片库并推送
2. Cloudflare 重新构建
3. 线上会自动使用更新后的片库

## 管理员使用逻辑

普通访客：

- 只能浏览片库
- 只能搜索你已经添加的电影
- 无法看到管理功能

管理员：

1. 点击右上角 `管理员登录`
2. 输入密码
3. 登录成功后出现 `控制台`
4. 在控制台中执行：
   - `添加影片`
   - `导出片单`
   - `导出数据`
5. 在线上环境中，添加/删除会直接写入 Cloudflare KV

## 默认排序

站点当前默认使用：

```text
上映时间
```

也就是说，已看电影默认按上映时间排序，而不是按评分排序。

## 常见维护流程

### 方案 A：本地页面维护

适合你自己直接在浏览器里管理：

1. 配置 `admin.local.js`
2. 双击打开 `index.html`
3. 登录
4. 通过控制台添加影片
5. 导出 `library.json` 和 `library.resolved.json`
6. 提交到 GitHub

### 方案 B：命令行维护

适合批量调整或脚本生成：

1. 修改 `data/library.json`
2. 运行 `npm run rebuild:library`
3. 提交到 GitHub

### 方案 C：线上管理

适合已经部署到 Cloudflare 后直接在线维护：

1. 打开线上站点
2. 管理员登录
3. 在控制台里添加或删除影片
4. 数据直接写入 Cloudflare KV

## 注意事项

- `admin.local.js` 不要提交到仓库
- `.dev.vars`、`.env` 一类本地密钥文件不要提交到仓库
- `data/library.resolved.json` 体积会随着片库增长变大，这是正常现象
- 当前项目主要按“电影片库”设计，部分剧集/番组名称未必能稳定匹配

## 推荐环境

- Node.js 18+
- Cloudflare Pages
- Chrome / Edge / Safari 最新版本

## License

仅供个人项目维护和展示使用。若你准备对外发布或商业化使用，请自行补充许可证说明。
