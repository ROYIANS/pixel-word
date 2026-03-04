# 像素物语 · Next.js 应用设计文档

**日期：** 2026-03-04
**状态：** 已确认，待实施
**原始 Demo：** `demo.html`（108 条像素物语，纯静态）

---

## 一、项目概述

将现有静态 HTML Demo 扩展为完整的 Next.js 全栈应用。核心目标：内容持久化、用户投稿与互动、管理后台，以及一系列像素风格的特色功能。

---

## 二、技术栈

| 层次 | 选型 |
|------|------|
| 框架 | Next.js 15（App Router + Server Actions） |
| 数据库 | MongoDB + Mongoose |
| 图标库 | Iconify（`pixel-art`、`game-icons` 等像素风图标集） |
| 认证 | 管理员：用户名/密码（bcrypt）+ JWT httpOnly cookie |
| 人机验证 | Cloudflare Turnstile（投稿防刷） |
| 图片处理 | Sharp（压缩/裁切） |
| 分享卡片 | `@vercel/og`（satori，服务端渲染 PNG） |
| AI 润色 | Claude API（`claude-haiku-4-5-20251001`） |
| AI 生图 | 可配置（DALL·E / Stability AI，默认关闭） |
| 邮件订阅 | Nodemailer + SMTP |
| 定时任务 | `node-cron`（每日一物） |
| 速率限制 | MongoDB TTL 集合（无需额外引入 Redis） |
| 部署 | Docker Compose（app + mongo） |

---

## 三、架构选型

**方案 A：Next.js 一体化单体（已确认）**

```
Next.js App Router
├── 前端页面（RSC + Client Components）
├── API Routes（公开数据接口）
├── Server Actions（管理操作、表单提交）
└── MongoDB（Mongoose）

Docker Compose:
  app   → Node.js / Next.js
  mongo → MongoDB 7
```

---

## 四、页面路由

```
/                    首页（网格、搜索、筛选、每日一物）
/daily               每日一物专页
/read                沉浸阅读模式（全屏翻卡）
/gacha               抽卡系统
/submit              投稿 + 创作工坊

/api/items           公开物语列表接口
/api/items/[id]      单条物语
/api/items/daily     今日物语
/api/items/[id]/like 点赞（IP 限流）
/api/share/[id]      分享卡片图片生成（PNG）
/api/gacha           抽卡接口
/api/rss             RSS Feed
/api/subscribe       邮件订阅

/admin               管理后台（需 JWT）
/admin/login         登录
/admin/items         物语增删改查
/admin/submissions   投稿审核
/admin/config        站点配置
```

---

## 五、数据模型

### `items` — 物语内容
```typescript
{
  _id: ObjectId,
  id: string,          // "001"～"108"，展示用编号
  icon: string,        // Iconify 图标名，如 "pixel-art:heart"
  image?: string,      // 自定义像素画图片 URL（优先于 icon 显示）
  name: string,        // "心碎小熊"
  cat: string,         // "情感"|"治愈"|"孤独"|"日常"|"自然"|"物件"|"夜晚"|"荒诞"
  text: string,        // 正文文案
  rarity: string,      // "common"|"rare"|"ssr"
  likes: number,       // 点赞总数
  status: string,      // "published"|"draft"
  createdAt: Date,
  updatedAt: Date
}
```

> 初始 108 条 emoji 在导入脚本中统一映射为对应 Iconify 图标名。
> 稀有度初始分配：common ≈ 70 条，rare ≈ 30 条，ssr ≈ 8 条。

### `submissions` — 投稿待审队列
```typescript
{
  _id: ObjectId,
  icon: string,
  image?: string,
  name: string,
  cat: string,
  text: string,
  status: string,      // "pending"|"approved"|"rejected"
  submitterNote?: string,
  adminNote?: string,
  createdAt: Date
}
```

### `comments` — 评论
```typescript
{
  _id: ObjectId,
  itemId: ObjectId,
  content: string,
  status: string,      // "visible"|"hidden"
  createdAt: Date
}
```

### `daily` — 每日精选
```typescript
{
  date: string,        // "2026-03-04"
  itemId: ObjectId
}
```

### `configs` — 站点配置 KV 表
```typescript
{
  key: string,
  value: Mixed
}
```

**内置配置项：**
- `gacha_free_daily`：每日免费抽卡次数（默认 3）
- `gacha_ssr_rate`：SSR 概率 % （默认 5）
- `ai_polish_enabled`：AI 润色开关（默认 true）
- `ai_image_enabled`：AI 生图开关（默认 false）
- `daily_auto`：每日一物自动选取（默认 true）

### `rate_limits` — IP 限流（MongoDB TTL 自动过期）
```typescript
{
  key: string,         // "like:{ip}:{itemId}" | "submit:{ip}"
  createdAt: Date      // TTL index
}
```

---

## 六、核心功能设计

### 6.1 抽卡系统（Gacha）

| 稀有度 | 标识 | 概率 |
|--------|------|------|
| 传说 SSR | ✦ | 5% |
| 稀有 R | ◈ | 25% |
| 普通 N | · | 70% |

- **单抽**：随机一条，像素风开包动画
- **十连**：10 次，保底至少 1 条 R 以上
- 每日免费次数由 config 控制
- 抽到的卡可直接收藏 / 生成分享卡片

### 6.2 分享卡片生成器

- 接口：`GET /api/share/[id]?ratio=1:1|9:16` → 返回 PNG
- 技术：`@vercel/og`（satori）服务端渲染
- 风格：深色像素背景 + Iconify 图标 + 文案 + 站点水印
- 支持 1:1（朋友圈）和 9:16（故事）两种尺寸

### 6.3 沉浸阅读模式（`/read`）

- 全屏单卡展示，背景色随分类变化
- PC：键盘 `←` `→` 切换，`Space` 随机跳
- 移动端：左右滑动手势
- 底部进度条
- 支持带分类参数进入（`/read?cat=孤独`）

### 6.4 投稿 + 创作工坊（`/submit`）

三步流程：

```
Step 1: 选图标
  ├── 从 Iconify 搜索选择
  ├── 上传图片（sharp 压缩）
  └── AI 生成（关键词 → 像素风图片）

Step 2: 填写内容
  ├── 选分类、填物件名、写文案
  └── "AI 润色"按钮（Claude haiku，可对比接受/拒绝）

Step 3: 预览 + Turnstile 验证 → 提交
  └── 进入 submissions 待审队列
```

### 6.5 每日一物

- `node-cron` 每天 0 点从 published items 随机选一条写入 `daily`
- 首页 hero 区展示今日物语
- `/api/rss` 提供 RSS Feed
- 邮件订阅：nodemailer + SMTP（配置在 config）

### 6.6 图标系统

- 默认使用 Iconify 图标（`@iconify/react`）
- 有 `image` 字段时优先展示自定义图片
- 前端渲染：`image ? <img> : <Icon icon={item.icon} />`

---

## 七、管理后台

### 认证
- 用户名/密码存 `.env`（`ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH`）
- bcrypt 验证，JWT 写 httpOnly cookie
- 无注册接口，单一管理员

### Dashboard
- 统计卡片：总物语数 / 本周新增 / 待审投稿 / 今日点赞
- 今日物语预览
- 最近投稿快速入口

### 物语管理 `/admin/items`
- 表格：图标 / 名称 / 分类 / 稀有度 / 状态 / 点赞数
- 搜索、分类筛选、批量删除
- 新建/编辑弹窗：全字段 + Iconify 图标选择器 + 自定义图片上传
- 初始导入脚本：`scripts/seed.ts`，一键导入 108 条 demo 数据

### 投稿审核 `/admin/submissions`
- 三栏：待审 / 已通过 / 已拒绝
- 操作：直接通过 / 编辑后通过 / 拒绝（填原因）
- 通过时自动分配 id、默认 rarity（可手动改）

### 站点配置 `/admin/config`
- 可视化表单，实时保存到 `configs` 集合

---

## 八、Docker 部署

### `docker-compose.yml`
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/pixel-tales
      - ADMIN_USERNAME=${ADMIN_USERNAME}
      - ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}
      - JWT_SECRET=${JWT_SECRET}
      - TURNSTILE_SECRET=${TURNSTILE_SECRET}
      - CLAUDE_API_KEY=${CLAUDE_API_KEY}
    volumes:
      - uploads:/app/public/uploads
    depends_on:
      - mongo

  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
  uploads:
```

### `.env` 示例
```
MONGODB_URI=mongodb://mongo:27017/pixel-tales
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt hash>
JWT_SECRET=<random string>
TURNSTILE_SECRET=<cloudflare turnstile secret>
CLAUDE_API_KEY=<claude api key>
AI_IMAGE_API_KEY=<optional>
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

---

## 九、项目目录结构（规划）

```
pixel-word/
├── app/
│   ├── (public)/
│   │   ├── page.tsx          # 首页
│   │   ├── daily/page.tsx
│   │   ├── read/page.tsx
│   │   ├── gacha/page.tsx
│   │   └── submit/page.tsx
│   ├── admin/
│   │   ├── login/page.tsx
│   │   ├── items/page.tsx
│   │   ├── submissions/page.tsx
│   │   └── config/page.tsx
│   └── api/
│       ├── items/route.ts
│       ├── items/[id]/route.ts
│       ├── items/[id]/like/route.ts
│       ├── items/daily/route.ts
│       ├── share/[id]/route.ts
│       ├── gacha/route.ts
│       ├── rss/route.ts
│       ├── subscribe/route.ts
│       ├── submissions/route.ts
│       └── admin/
│           ├── auth/route.ts
│           ├── items/route.ts
│           ├── submissions/[id]/route.ts
│           └── config/route.ts
├── components/
│   ├── ui/                   # 基础 UI 组件
│   ├── ItemCard.tsx
│   ├── GachaModal.tsx
│   ├── ShareCard.tsx
│   └── PixelIcon.tsx
├── lib/
│   ├── mongodb.ts
│   ├── auth.ts
│   ├── ratelimit.ts
│   └── ai.ts
├── models/
│   ├── Item.ts
│   ├── Submission.ts
│   ├── Comment.ts
│   ├── Daily.ts
│   └── Config.ts
├── scripts/
│   └── seed.ts               # 导入 demo 数据
├── docs/
│   └── plans/
│       └── 2026-03-04-pixel-tales-nextjs-design.md
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

*设计确认于 2026-03-04，下一步：编写实施计划。*
