# 像素物语 Next.js Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the static `demo.html` pixel-art Chinese quote library into a full-stack Next.js 15 application with persistence, user submissions, social interactions, gacha system, share cards, and an admin panel.

**Architecture:** Next.js 15 App Router monolith with Server Actions for mutations, API Routes for public/admin endpoints, MongoDB + Mongoose for persistence, all containerized via Docker Compose.

**Tech Stack:** Next.js 15, TypeScript, MongoDB 7 + Mongoose, Iconify (`@iconify/react`), Cloudflare Turnstile, `@vercel/og` (satori), Sharp, Claude API (haiku), `node-cron`, Nodemailer, Vitest, Docker Compose

**Design doc:** `docs/plans/2026-03-04-pixel-tales-nextjs-design.md`

---

## Phase 1: Foundation

---

### Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `.gitignore`

**Step 1: Create Next.js app**

```bash
cd D:/个人/pixel-word
npx create-next-app@latest . --typescript --app --tailwind --eslint --src-dir=false --import-alias="@/*" --no-git
```

Expected: project scaffolded in current directory.

**Step 2: Install core dependencies**

```bash
npm install mongoose @iconify/react @iconify/json bcryptjs jsonwebtoken node-cron nodemailer sharp
npm install @vercel/og
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @types/bcryptjs @types/jsonwebtoken @types/nodemailer
```

**Step 3: Configure Vitest — create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

**Step 4: Create `vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

**Step 5: Add test script to `package.json`**

Add to `scripts`:
```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 6: Create `.env.example`**

```
MONGODB_URI=mongodb://mongo:27017/pixel-tales
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=
JWT_SECRET=change-me-random-string
TURNSTILE_SECRET=
CLAUDE_API_KEY=
AI_IMAGE_API_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

**Step 7: Create `.env.local` from example**

```bash
cp .env.example .env.local
```

Fill in `MONGODB_URI=mongodb://localhost:27017/pixel-tales` for local dev.

**Step 8: Commit**

```bash
git init
git add .
git commit -m "chore: scaffold Next.js 15 project with TypeScript and Vitest"
```

---

### Task 2: MongoDB connection

**Files:**
- Create: `lib/mongodb.ts`
- Create: `lib/__tests__/mongodb.test.ts`

**Step 1: Write failing test — `lib/__tests__/mongodb.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('connectDB', () => {
  it('should export a connectDB function', async () => {
    const mod = await import('../mongodb')
    expect(typeof mod.connectDB).toBe('function')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm run test:run -- lib/__tests__/mongodb.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement `lib/mongodb.ts`**

```typescript
import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI!

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable')
}

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined
}

const cache: MongooseCache = global._mongooseCache ?? { conn: null, promise: null }
global._mongooseCache = cache

export async function connectDB() {
  if (cache.conn) return cache.conn

  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI).then((m) => m)
  }

  cache.conn = await cache.promise
  return cache.conn
}
```

**Step 4: Run test to verify it passes**

```bash
npm run test:run -- lib/__tests__/mongodb.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add lib/mongodb.ts lib/__tests__/mongodb.test.ts
git commit -m "feat: add MongoDB connection singleton"
```

---

### Task 3: Mongoose models

**Files:**
- Create: `models/Item.ts`
- Create: `models/Submission.ts`
- Create: `models/Comment.ts`
- Create: `models/Daily.ts`
- Create: `models/Config.ts`
- Create: `models/RateLimit.ts`
- Create: `models/__tests__/Item.test.ts`

**Step 1: Write failing test — `models/__tests__/Item.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { ItemSchema } from '../Item'

describe('Item model', () => {
  it('should require icon, name, cat, text fields', () => {
    const requiredPaths = ['icon', 'name', 'cat', 'text']
    requiredPaths.forEach((field) => {
      expect(ItemSchema.path(field).isRequired).toBe(true)
    })
  })

  it('should have default likes of 0', () => {
    expect((ItemSchema.path('likes') as any).defaultValue).toBe(0)
  })

  it('should have default status of published', () => {
    expect((ItemSchema.path('status') as any).defaultValue).toBe('published')
  })
})
```

**Step 2: Run test — expect FAIL**

```bash
npm run test:run -- models/__tests__/Item.test.ts
```

**Step 3: Implement `models/Item.ts`**

```typescript
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IItem extends Document {
  id: string
  icon: string
  image?: string
  name: string
  cat: '情感' | '治愈' | '孤独' | '日常' | '自然' | '物件' | '夜晚' | '荒诞'
  text: string
  rarity: 'common' | 'rare' | 'ssr'
  likes: number
  status: 'published' | 'draft'
  createdAt: Date
  updatedAt: Date
}

export const ItemSchema = new Schema<IItem>(
  {
    id: { type: String, required: true, unique: true },
    icon: { type: String, required: true },
    image: { type: String },
    name: { type: String, required: true },
    cat: {
      type: String,
      required: true,
      enum: ['情感', '治愈', '孤独', '日常', '自然', '物件', '夜晚', '荒诞'],
    },
    text: { type: String, required: true },
    rarity: { type: String, enum: ['common', 'rare', 'ssr'], default: 'common' },
    likes: { type: Number, default: 0 },
    status: { type: String, enum: ['published', 'draft'], default: 'published' },
  },
  { timestamps: true }
)

const Item: Model<IItem> =
  mongoose.models.Item ?? mongoose.model<IItem>('Item', ItemSchema)

export default Item
```

**Step 4: Implement remaining models**

Create `models/Submission.ts`:
```typescript
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface ISubmission extends Document {
  icon: string
  image?: string
  name: string
  cat: string
  text: string
  status: 'pending' | 'approved' | 'rejected'
  submitterNote?: string
  adminNote?: string
  createdAt: Date
}

const SubmissionSchema = new Schema<ISubmission>(
  {
    icon: { type: String, required: true },
    image: { type: String },
    name: { type: String, required: true },
    cat: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    submitterNote: { type: String },
    adminNote: { type: String },
  },
  { timestamps: true }
)

const Submission: Model<ISubmission> =
  mongoose.models.Submission ?? mongoose.model<ISubmission>('Submission', SubmissionSchema)

export default Submission
```

Create `models/Comment.ts`:
```typescript
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IComment extends Document {
  itemId: mongoose.Types.ObjectId
  content: string
  status: 'visible' | 'hidden'
  createdAt: Date
}

const CommentSchema = new Schema<IComment>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    content: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
  },
  { timestamps: true }
)

const Comment: Model<IComment> =
  mongoose.models.Comment ?? mongoose.model<IComment>('Comment', CommentSchema)

export default Comment
```

Create `models/Daily.ts`:
```typescript
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IDaily extends Document {
  date: string
  itemId: mongoose.Types.ObjectId
}

const DailySchema = new Schema<IDaily>({
  date: { type: String, required: true, unique: true },
  itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
})

const Daily: Model<IDaily> =
  mongoose.models.Daily ?? mongoose.model<IDaily>('Daily', DailySchema)

export default Daily
```

Create `models/Config.ts`:
```typescript
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IConfig extends Document {
  key: string
  value: unknown
}

const ConfigSchema = new Schema<IConfig>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
})

const Config: Model<IConfig> =
  mongoose.models.Config ?? mongoose.model<IConfig>('Config', ConfigSchema)

export default Config
```

Create `models/RateLimit.ts`:
```typescript
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IRateLimit extends Document {
  key: string
  createdAt: Date
}

const RateLimitSchema = new Schema<IRateLimit>({
  key: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 }, // TTL: 24h
})

const RateLimit: Model<IRateLimit> =
  mongoose.models.RateLimit ?? mongoose.model<IRateLimit>('RateLimit', RateLimitSchema)

export default RateLimit
```

**Step 5: Run tests — expect PASS**

```bash
npm run test:run -- models/__tests__/Item.test.ts
```

**Step 6: Commit**

```bash
git add models/
git commit -m "feat: add Mongoose models (Item, Submission, Comment, Daily, Config, RateLimit)"
```

---

### Task 4: Data seed script

**Files:**
- Create: `scripts/seed.ts`
- Create: `scripts/emoji-to-icon.ts`

**Step 1: Create emoji → Iconify mapping — `scripts/emoji-to-icon.ts`**

```typescript
// Maps the 108 demo emoji to Iconify pixel-art / game-icons equivalents
export const emojiToIcon: Record<string, string> = {
  '🐻': 'pixel-art:bear',
  '💌': 'pixel-art:mail',
  '🐶': 'pixel-art:dog',
  '💔': 'pixel-art:heart-broken',
  '🕯️': 'pixel-art:candle',
  '🧁': 'pixel-art:cupcake',
  '💘': 'pixel-art:heart-arrow',
  '🤖': 'pixel-art:robot',
  '👼': 'pixel-art:angel',
  '🐾': 'pixel-art:paw',
  '🍓': 'pixel-art:strawberry',
  '🎀': 'pixel-art:ribbon',
  '💬': 'pixel-art:chat',
  '🌸': 'pixel-art:cherry-blossom',
  '📝': 'pixel-art:notepad',
  '🫙': 'pixel-art:jar',
  '🧇': 'pixel-art:waffle',
  '🌹': 'pixel-art:rose',
  '📻': 'pixel-art:radio',
  '🎠': 'pixel-art:merry-go-round',
  '🌙': 'pixel-art:moon',
  '🎶': 'pixel-art:musical-notes',
  '🫐': 'pixel-art:blueberries',
  '🪐': 'pixel-art:planet',
  '🧸': 'pixel-art:teddy-bear',
  '☕': 'pixel-art:coffee',
  '🛏️': 'pixel-art:bed',
  '🧣': 'pixel-art:scarf',
  '🌱': 'pixel-art:seedling',
  '🫖': 'pixel-art:teapot',
  '🪟': 'pixel-art:window',
  '🕰️': 'pixel-art:clock',
  '🪴': 'pixel-art:potted-plant',
  '🍵': 'pixel-art:tea',
  '📿': 'pixel-art:beads',
  '🎐': 'pixel-art:wind-chime',
  '🐱': 'pixel-art:cat',
  '🌷': 'pixel-art:tulip',
  '🗝️': 'pixel-art:key',
  '🖼️': 'pixel-art:picture-frame',
  '🕸️': 'pixel-art:spider-web',
  '🪞': 'pixel-art:mirror',
  '🎞️': 'pixel-art:film',
  '🪑': 'pixel-art:chair',
  '🎆': 'pixel-art:fireworks',
  '🧩': 'pixel-art:puzzle',
  '🌫️': 'pixel-art:fog',
  '📬': 'pixel-art:mailbox',
  '🎑': 'pixel-art:hotpot',
  '🪜': 'pixel-art:ladder',
  '🐰': 'pixel-art:rabbit',
  '🚽': 'pixel-art:toilet',
  '🛁': 'pixel-art:bathtub',
  '🍳': 'pixel-art:frying-pan',
  '📖': 'pixel-art:book',
  '🥣': 'pixel-art:bowl',
  '🧴': 'pixel-art:lotion',
  '🧦': 'pixel-art:socks',
  '🎒': 'pixel-art:backpack',
  '📌': 'pixel-art:pushpin',
  '🧹': 'pixel-art:broom',
  '⏰': 'pixel-art:alarm-clock',
  '🌧️': 'pixel-art:rain',
  '🍂': 'pixel-art:fallen-leaf',
  '❄️': 'pixel-art:snowflake',
  '🌿': 'pixel-art:herb',
  '🌾': 'pixel-art:sheaf',
  '🌺': 'pixel-art:hibiscus',
  '🌳': 'pixel-art:tree',
  '🌈': 'pixel-art:rainbow',
  '🦋': 'pixel-art:butterfly',
  '🌵': 'pixel-art:cactus',
  '🍄': 'pixel-art:mushroom',
  '🪸': 'pixel-art:coral',
  '🔭': 'pixel-art:telescope',
  '🧭': 'pixel-art:compass',
  '🪆': 'pixel-art:nesting-doll',
  '⏳': 'pixel-art:hourglass',
  '🔮': 'pixel-art:crystal-ball',
  '🪬': 'pixel-art:hamsa',
  '📜': 'pixel-art:scroll',
  '🪗': 'pixel-art:accordion',
  '🧲': 'pixel-art:magnet',
  '🌌': 'pixel-art:galaxy',
  '🦉': 'pixel-art:owl',
  '🌃': 'pixel-art:night-city',
  '🪔': 'pixel-art:diya-lamp',
  '🌉': 'pixel-art:bridge',
  '🐚': 'pixel-art:shell',
  '📠': 'pixel-art:fax',
  '🎭': 'pixel-art:masks',
  '🐌': 'pixel-art:snail',
  '🌀': 'pixel-art:cyclone',
  '🌡️': 'pixel-art:thermometer',
  '🪭': 'pixel-art:folding-fan',
  '🎏': 'pixel-art:carp-streamer',
}

export function getIcon(emoji: string): string {
  return emojiToIcon[emoji] ?? 'pixel-art:star'
}
```

> **Note:** Iconify `pixel-art` set may not have all icons. Check https://icon-sets.iconify.design/pixel-art/ before running the seed. For missing icons, substitute the closest `game-icons:*` equivalent. After running the seed, do a visual pass in the admin panel to correct any mismatches.

**Step 2: Create `scripts/seed.ts`**

```typescript
import mongoose from 'mongoose'
import { connectDB } from '../lib/mongodb'
import Item from '../models/Item'
import Config from '../models/Config'
import { getIcon } from './emoji-to-icon'

// Paste the DATA array from demo.html here
const DEMO_DATA = [
  { id: '001', em: '🐻', name: '心碎小熊', cat: '情感', text: '我当然赢不了你啦，你又不是真心的。' },
  { id: '002', em: '💌', name: '树莓味的情书', cat: '情感', text: '我好喜欢你啊，但我不会说的。' },
  // ... (paste all 108 items from demo.html DATA array)
]

// Rarity distribution: ssr=8, rare=30, common=70
function assignRarity(index: number): 'common' | 'rare' | 'ssr' {
  if (index < 8) return 'ssr'
  if (index < 38) return 'rare'
  return 'common'
}

async function seed() {
  await connectDB()

  // Clear existing items
  await Item.deleteMany({})
  console.log('Cleared existing items')

  const items = DEMO_DATA.map((d, i) => ({
    id: d.id,
    icon: getIcon(d.em),
    name: d.name,
    cat: d.cat,
    text: d.text,
    rarity: assignRarity(i),
    likes: 0,
    status: 'published',
  }))

  await Item.insertMany(items)
  console.log(`Seeded ${items.length} items`)

  // Seed default configs
  const defaults = [
    { key: 'gacha_free_daily', value: 3 },
    { key: 'gacha_ssr_rate', value: 5 },
    { key: 'gacha_rare_rate', value: 25 },
    { key: 'ai_polish_enabled', value: true },
    { key: 'ai_image_enabled', value: false },
    { key: 'daily_auto', value: true },
    { key: 'site_title', value: '像素物语' },
  ]

  for (const cfg of defaults) {
    await Config.findOneAndUpdate({ key: cfg.key }, cfg, { upsert: true })
  }
  console.log('Seeded default configs')

  await mongoose.disconnect()
  console.log('Done!')
}

seed().catch(console.error)
```

**Step 3: Add seed script to `package.json`**

```json
"seed": "tsx scripts/seed.ts"
```

Install tsx: `npm install -D tsx`

**Step 4: Run seed (requires local MongoDB running)**

```bash
npm run seed
```

Expected output:
```
Cleared existing items
Seeded 108 items
Seeded default configs
Done!
```

**Step 5: Commit**

```bash
git add scripts/ package.json
git commit -m "feat: add seed script with emoji→iconify mapping and default configs"
```

---

## Phase 2: Public API

---

### Task 5: Items list API

**Files:**
- Create: `app/api/items/route.ts`
- Create: `app/api/items/__tests__/route.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn() }))
vi.mock('@/models/Item', () => ({
  default: {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          skip: vi.fn().mockResolvedValue([
            { id: '001', icon: 'pixel-art:bear', name: '心碎小熊', cat: '情感', text: '...', rarity: 'common', likes: 0, status: 'published' }
          ])
        })
      })
    }),
    countDocuments: vi.fn().mockResolvedValue(1),
  }
}))

describe('GET /api/items', () => {
  it('returns items array with total', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/items')
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data.items)).toBe(true)
    expect(typeof data.total).toBe('number')
  })
})
```

**Step 2: Run test — expect FAIL**

```bash
npm run test:run -- app/api/items/__tests__/route.test.ts
```

**Step 3: Implement `app/api/items/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Item from '@/models/Item'

export async function GET(req: NextRequest) {
  try {
    await connectDB()
    const { searchParams } = new URL(req.url)

    const cat = searchParams.get('cat')
    const q = searchParams.get('q')
    const sort = searchParams.get('sort') ?? 'd'
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '50')

    const filter: Record<string, unknown> = { status: 'published' }
    if (cat && cat !== '全部') filter.cat = cat
    if (q) filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { text: { $regex: q, $options: 'i' } },
    ]

    const sortMap: Record<string, Record<string, number>> = {
      d: { createdAt: 1 },
      l: { likes: -1 },
      n: { createdAt: -1 },
    }

    const [items, total] = await Promise.all([
      Item.find(filter)
        .sort(sortMap[sort] ?? sortMap.d)
        .limit(limit)
        .skip((page - 1) * limit),
      Item.countDocuments(filter),
    ])

    return NextResponse.json({ items, total, page, limit })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 4: Run test — expect PASS**

```bash
npm run test:run -- app/api/items/__tests__/route.test.ts
```

**Step 5: Commit**

```bash
git add app/api/items/
git commit -m "feat: add GET /api/items with filtering, search, sort, and pagination"
```

---

### Task 6: Single item + daily item APIs

**Files:**
- Create: `app/api/items/[id]/route.ts`
- Create: `app/api/items/daily/route.ts`

**Step 1: Implement `app/api/items/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Item from '@/models/Item'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB()
    const { id } = await params
    const item = await Item.findOne({ id, status: 'published' })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(item)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 2: Implement `app/api/items/daily/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Daily from '@/models/Daily'
import Item from '@/models/Item'

function todayString() {
  return new Date().toISOString().split('T')[0]
}

export async function GET() {
  try {
    await connectDB()
    const today = todayString()

    let daily = await Daily.findOne({ date: today }).populate('itemId')
    if (!daily) {
      // Fallback: pick random published item
      const count = await Item.countDocuments({ status: 'published' })
      const random = Math.floor(Math.random() * count)
      const item = await Item.findOne({ status: 'published' }).skip(random)
      if (!item) return NextResponse.json({ error: 'No items' }, { status: 404 })
      daily = await Daily.create({ date: today, itemId: item._id })
      daily = await Daily.findOne({ date: today }).populate('itemId')
    }

    return NextResponse.json(daily!.itemId)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 3: Commit**

```bash
git add app/api/items/[id]/ app/api/items/daily/
git commit -m "feat: add GET /api/items/[id] and /api/items/daily"
```

---

### Task 7: Like API with rate limiting

**Files:**
- Create: `lib/ratelimit.ts`
- Create: `lib/__tests__/ratelimit.test.ts`
- Create: `app/api/items/[id]/like/route.ts`

**Step 1: Write failing test — `lib/__tests__/ratelimit.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/models/RateLimit', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  }
}))
vi.mock('@/lib/mongodb', () => ({ connectDB: vi.fn() }))

describe('checkRateLimit', () => {
  it('should export checkRateLimit function', async () => {
    const mod = await import('../ratelimit')
    expect(typeof mod.checkRateLimit).toBe('function')
  })
})
```

**Step 2: Implement `lib/ratelimit.ts`**

```typescript
import { connectDB } from './mongodb'
import RateLimit from '@/models/RateLimit'

/**
 * Returns true if action is allowed, false if rate limited.
 * key example: "like:127.0.0.1:001"
 */
export async function checkRateLimit(key: string): Promise<boolean> {
  await connectDB()
  const existing = await RateLimit.findOne({ key })
  if (existing) return false
  await RateLimit.create({ key })
  return true
}
```

**Step 3: Implement `app/api/items/[id]/like/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Item from '@/models/Item'
import { checkRateLimit } from '@/lib/ratelimit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB()
    const { id } = await params

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    const key = `like:${ip}:${id}`
    const allowed = await checkRateLimit(key)
    if (!allowed) {
      return NextResponse.json({ error: 'Already liked' }, { status: 429 })
    }

    const item = await Item.findOneAndUpdate(
      { id, status: 'published' },
      { $inc: { likes: 1 } },
      { new: true }
    )
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ likes: item.likes })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 4: Run tests**

```bash
npm run test:run -- lib/__tests__/ratelimit.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add lib/ratelimit.ts lib/__tests__/ratelimit.test.ts app/api/items/[id]/like/
git commit -m "feat: add like API with IP-based rate limiting via MongoDB TTL"
```

---

### Task 8: Comments API

**Files:**
- Create: `app/api/items/[id]/comments/route.ts`

**Step 1: Implement**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Comment from '@/models/Comment'
import Item from '@/models/Item'
import { checkRateLimit } from '@/lib/ratelimit'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB()
  const { id } = await params
  const item = await Item.findOne({ id })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const comments = await Comment.find({ itemId: item._id, status: 'visible' })
    .sort({ createdAt: -1 })
    .limit(50)
  return NextResponse.json(comments)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB()
  const { id } = await params
  const { content } = await req.json()

  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 })
  }
  if (content.length > 500) {
    return NextResponse.json({ error: 'Too long' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const allowed = await checkRateLimit(`comment:${ip}:${id}`)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many comments' }, { status: 429 })
  }

  const item = await Item.findOne({ id })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const comment = await Comment.create({ itemId: item._id, content: content.trim() })
  return NextResponse.json(comment, { status: 201 })
}
```

**Step 2: Commit**

```bash
git add app/api/items/[id]/comments/
git commit -m "feat: add comments API with rate limiting"
```

---

### Task 9: Submissions API

**Files:**
- Create: `app/api/submissions/route.ts`

**Step 1: Implement**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Submission from '@/models/Submission'
import { checkRateLimit } from '@/lib/ratelimit'

const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

async function verifyTurnstile(token: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'development') return true // skip in dev
  const res = await fetch(TURNSTILE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: process.env.TURNSTILE_SECRET,
      response: token,
    }),
  })
  const data = await res.json()
  return data.success === true
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const { icon, image, name, cat, text, submitterNote, turnstileToken } = body

  if (!icon || !name || !cat || !text) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const valid = await verifyTurnstile(turnstileToken ?? '')
  if (!valid) {
    return NextResponse.json({ error: 'Human verification failed' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const allowed = await checkRateLimit(`submit:${ip}`)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many submissions' }, { status: 429 })
  }

  const submission = await Submission.create({
    icon, image, name, cat, text, submitterNote,
  })
  return NextResponse.json({ id: submission._id }, { status: 201 })
}
```

**Step 2: Commit**

```bash
git add app/api/submissions/
git commit -m "feat: add submissions API with Turnstile verification"
```

---

## Phase 3: Admin

---

### Task 10: Admin auth

**Files:**
- Create: `lib/auth.ts`
- Create: `lib/__tests__/auth.test.ts`
- Create: `app/api/admin/auth/route.ts`
- Create: `middleware.ts`

**Step 1: Write failing test — `lib/__tests__/auth.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'

describe('auth lib', () => {
  it('exports signToken and verifyToken', async () => {
    const mod = await import('../auth')
    expect(typeof mod.signToken).toBe('function')
    expect(typeof mod.verifyToken).toBe('function')
  })
})
```

**Step 2: Run — expect FAIL**

```bash
npm run test:run -- lib/__tests__/auth.test.ts
```

**Step 3: Implement `lib/auth.ts`**

```typescript
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret'
const JWT_EXPIRES = '7d'

export function signToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES })
}

export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as jwt.JwtPayload
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
```

**Step 4: Implement `app/api/admin/auth/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { signToken, comparePassword } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const validUser = username === process.env.ADMIN_USERNAME
  const validPass = await comparePassword(
    password,
    process.env.ADMIN_PASSWORD_HASH ?? ''
  )

  if (!validUser || !validPass) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const token = signToken({ role: 'admin', username })
  const res = NextResponse.json({ ok: true })
  res.cookies.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('admin_token')
  return res
}
```

**Step 5: Implement `middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Protect /admin/* routes except /admin/login
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const token = req.cookies.get('admin_token')?.value
    const payload = token ? verifyToken(token) : null
    if (!payload) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
  }

  // Protect /api/admin/* routes except /api/admin/auth
  if (pathname.startsWith('/api/admin') && !pathname.startsWith('/api/admin/auth')) {
    const token = req.cookies.get('admin_token')?.value
    const payload = token ? verifyToken(token) : null
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
```

**Step 6: Run tests**

```bash
npm run test:run -- lib/__tests__/auth.test.ts
```

Expected: PASS

**Step 7: Generate password hash for `.env.local`**

```bash
node -e "const b=require('bcryptjs'); b.hash('your-password', 12).then(console.log)"
```

Copy hash into `.env.local` as `ADMIN_PASSWORD_HASH`.

**Step 8: Commit**

```bash
git add lib/auth.ts lib/__tests__/auth.test.ts app/api/admin/auth/ middleware.ts
git commit -m "feat: admin auth with bcrypt + JWT httpOnly cookie + middleware protection"
```

---

### Task 11: Admin items CRUD API

**Files:**
- Create: `app/api/admin/items/route.ts`
- Create: `app/api/admin/items/[id]/route.ts`

**Step 1: Implement `app/api/admin/items/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Item from '@/models/Item'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const cat = searchParams.get('cat')
  const q = searchParams.get('q')
  const status = searchParams.get('status')

  const filter: Record<string, unknown> = {}
  if (cat && cat !== '全部') filter.cat = cat
  if (status) filter.status = status
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { text: { $regex: q, $options: 'i' } },
  ]

  const items = await Item.find(filter).sort({ createdAt: -1 })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  await connectDB()
  const body = await req.json()

  // Auto-assign next id
  const last = await Item.findOne().sort({ id: -1 })
  const nextId = last
    ? String(parseInt(last.id) + 1).padStart(3, '0')
    : '109'

  const item = await Item.create({ ...body, id: nextId })
  return NextResponse.json(item, { status: 201 })
}
```

**Step 2: Implement `app/api/admin/items/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Item from '@/models/Item'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB()
  const { id } = await params
  const body = await req.json()
  const item = await Item.findOneAndUpdate({ id }, body, { new: true })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB()
  const { id } = await params
  await Item.findOneAndDelete({ id })
  return NextResponse.json({ ok: true })
}
```

**Step 3: Commit**

```bash
git add app/api/admin/items/
git commit -m "feat: admin CRUD API for items"
```

---

### Task 12: Admin submissions API

**Files:**
- Create: `app/api/admin/submissions/route.ts`
- Create: `app/api/admin/submissions/[id]/route.ts`

**Step 1: Implement `app/api/admin/submissions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Submission from '@/models/Submission'

export async function GET(req: NextRequest) {
  await connectDB()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'pending'
  const submissions = await Submission.find({ status }).sort({ createdAt: -1 })
  return NextResponse.json(submissions)
}
```

**Step 2: Implement `app/api/admin/submissions/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Submission from '@/models/Submission'
import Item from '@/models/Item'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB()
  const { id } = await params
  const body = await req.json()
  const { action, adminNote, ...fields } = body

  const submission = await Submission.findById(id)
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'approve') {
    const last = await Item.findOne().sort({ id: -1 })
    const nextId = last ? String(parseInt(last.id) + 1).padStart(3, '0') : '109'

    await Item.create({
      id: nextId,
      icon: fields.icon ?? submission.icon,
      image: fields.image ?? submission.image,
      name: fields.name ?? submission.name,
      cat: fields.cat ?? submission.cat,
      text: fields.text ?? submission.text,
      rarity: fields.rarity ?? 'common',
      status: 'published',
    })
    submission.status = 'approved'
  } else if (action === 'reject') {
    submission.status = 'rejected'
  }

  if (adminNote) submission.adminNote = adminNote
  await submission.save()
  return NextResponse.json(submission)
}
```

**Step 3: Commit**

```bash
git add app/api/admin/submissions/
git commit -m "feat: admin submissions review API (approve/reject)"
```

---

### Task 13: Admin config API

**Files:**
- Create: `app/api/admin/config/route.ts`

**Step 1: Implement**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Config from '@/models/Config'

export async function GET() {
  await connectDB()
  const configs = await Config.find({})
  const map = Object.fromEntries(configs.map((c) => [c.key, c.value]))
  return NextResponse.json(map)
}

export async function PUT(req: NextRequest) {
  await connectDB()
  const body = await req.json()
  const updates = await Promise.all(
    Object.entries(body).map(([key, value]) =>
      Config.findOneAndUpdate({ key }, { key, value }, { upsert: true, new: true })
    )
  )
  return NextResponse.json(updates)
}
```

**Step 2: Commit**

```bash
git add app/api/admin/config/
git commit -m "feat: admin config API"
```

---

## Phase 4: Frontend — Public Pages

---

### Task 14: Design system + global styles

**Files:**
- Modify: `app/globals.css`
- Create: `lib/theme.ts`
- Create: `components/PixelIcon.tsx`

**Step 1: Port CSS variables from `demo.html` to `app/globals.css`**

Add to `app/globals.css` after existing Tailwind directives:

```css
:root {
  --cream: #faf4e8;
  --cream2: #f2e8d0;
  --cream3: #e4d5b5;
  --ink: #1e150a;
  --ink2: #4a3520;
  --ink3: #8a7258;
  --og: #d96c30;
  --og2: #f08c50;
  --og3: #fde0c8;
  --teal: #2e7a6a;
  --teal2: #4a9a88;
  --teal3: #ceeae4;
  --rose: #b84858;
  --rose2: #d86878;
  --rose3: #f8dde4;
  --blue: #3a6898;
  --blue2: #5888b8;
  --blue3: #d8e8f8;
  --pur: #5a4888;
  --pur2: #7a68a8;
  --pur3: #e4dff8;
  --grn: #4a8838;
  --grn2: #6aaa58;
  --grn3: #d4eece;
  --yel: #c89820;
  --yel2: #e8b830;
  --yel3: #fdf0c0;
  --shadow: 4px 4px 0;
  --font: 'Noto Serif SC', serif;
  --px: 'DotGothic16', monospace;
}

body {
  background: var(--cream);
  color: var(--ink);
  font-family: var(--font);
  cursor: crosshair;
}

/* pixel grain overlay */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='3' height='3'%3E%3Crect x='0' y='0' width='1' height='1' fill='rgba(30,21,10,0.025)'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 9999;
}

::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: var(--cream2); border-left: 2px solid var(--ink); }
::-webkit-scrollbar-thumb { background: var(--ink); border: 2px solid var(--cream2); }
```

**Step 2: Create `lib/theme.ts`**

```typescript
export const CAT_COLORS: Record<string, string> = {
  情感: 'var(--rose)',
  治愈: 'var(--teal)',
  孤独: 'var(--blue)',
  日常: 'var(--og)',
  自然: 'var(--grn)',
  物件: 'var(--yel)',
  夜晚: 'var(--pur)',
  荒诞: 'var(--rose2)',
}

export const RARITY_COLORS: Record<string, string> = {
  ssr: '#f5c518',
  rare: '#c0c0c0',
  common: 'var(--ink3)',
}

export const CATEGORIES = ['情感', '治愈', '孤独', '日常', '自然', '物件', '夜晚', '荒诞'] as const
export type Category = (typeof CATEGORIES)[number]
```

**Step 3: Create `components/PixelIcon.tsx`**

```tsx
'use client'
import { Icon } from '@iconify/react'

interface PixelIconProps {
  icon: string
  image?: string
  size?: number
  className?: string
}

export default function PixelIcon({ icon, image, size = 38, className }: PixelIconProps) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
      />
    )
  }
  return <Icon icon={icon} width={size} height={size} className={className} />
}
```

**Step 4: Add Google Fonts to `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Noto_Serif_SC } from 'next/font/google'
import './globals.css'

const notoSerif = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  variable: '--font-noto',
})

export const metadata: Metadata = {
  title: '像素物语',
  description: '每件小东西，都藏着一句话',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={notoSerif.variable}>{children}</body>
    </html>
  )
}
```

**Step 5: Commit**

```bash
git add app/globals.css lib/theme.ts components/PixelIcon.tsx app/layout.tsx
git commit -m "feat: design system — CSS vars, theme tokens, PixelIcon component"
```

---

### Task 15: ItemCard component

**Files:**
- Create: `components/ItemCard.tsx`

**Step 1: Implement**

```tsx
'use client'
import { useState } from 'react'
import PixelIcon from './PixelIcon'
import { CAT_COLORS } from '@/lib/theme'

interface Item {
  id: string
  icon: string
  image?: string
  name: string
  cat: string
  text: string
  rarity: 'common' | 'rare' | 'ssr'
  likes: number
}

interface ItemCardProps {
  item: Item
  onOpenDetail?: (item: Item) => void
}

export default function ItemCard({ item, onOpenDetail }: ItemCardProps) {
  const [liked, setLiked] = useState(false)
  const [likes, setLikes] = useState(item.likes)
  const [copied, setCopied] = useState(false)

  async function handleLike() {
    if (liked) return
    const res = await fetch(`/api/items/${item.id}/like`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setLikes(data.likes)
      setLiked(true)
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(`【${item.name}】${item.text}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const accentColor = CAT_COLORS[item.cat] ?? 'var(--og)'

  return (
    <div
      className="card"
      data-cat={item.cat}
      style={{ '--accent': accentColor } as React.CSSProperties}
    >
      {/* top accent bar */}
      <div style={{ height: 3, background: accentColor }} />

      <div className="c-top">
        <div className="c-em">
          <PixelIcon icon={item.icon} image={item.image} size={28} />
        </div>
        <div className="c-meta">
          <div className="c-name">{item.name}</div>
          <span className="c-cat" style={{ color: accentColor, borderColor: accentColor }}>
            {item.cat}
          </span>
          {item.rarity !== 'common' && (
            <span className="c-rarity" data-rarity={item.rarity}>
              {item.rarity === 'ssr' ? '✦' : '◈'}
            </span>
          )}
        </div>
      </div>

      <div className="c-body" onClick={() => onOpenDetail?.(item)}>
        <div className="c-txt">{item.text}</div>
      </div>

      <div className="c-foot">
        <div className="c-id"># {item.id}</div>
        <div className="c-acts">
          <button
            className={`btn-lk ${liked ? 'on' : ''}`}
            onClick={handleLike}
            aria-label="收藏"
          >
            {liked ? '♥' : '♡'} {likes > 0 && likes}
          </button>
          <button
            className={`btn-cp ${copied ? 'ok' : ''}`}
            onClick={handleCopy}
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Add card styles to `app/globals.css`**

Port card, c-top, c-em, c-meta, c-name, c-cat, c-body, c-txt, c-foot, btn-lk, btn-cp styles from `demo.html` verbatim.

**Step 3: Commit**

```bash
git add components/ItemCard.tsx app/globals.css
git commit -m "feat: ItemCard component with like and copy actions"
```

---

### Task 16: Homepage

**Files:**
- Create: `app/page.tsx`
- Create: `components/Header.tsx`
- Create: `components/Hero.tsx`
- Create: `components/Controls.tsx`
- Create: `components/Toast.tsx`
- Create: `components/Footer.tsx`

**Step 1: Create `components/Header.tsx`**

```tsx
'use client'
import Link from 'next/link'

export default function Header({ total }: { total: number }) {
  return (
    <header className="hd">
      <div className="hd-in">
        <Link href="/" className="logo">
          <div className="logo-sq"><b /><b /><b /><b /></div>
          像素物语
        </Link>
        <nav className="hd-pills">
          <Link href="/" className="hd-pill">首页</Link>
          <Link href="/gacha" className="hd-pill">抽卡</Link>
          <Link href="/read" className="hd-pill">沉浸</Link>
          <Link href="/submit" className="hd-pill">投稿</Link>
        </nav>
        <div className="hd-badge">共 {total} 条</div>
      </div>
    </header>
  )
}
```

**Step 2: Create `app/page.tsx` as a Server Component**

```tsx
import { connectDB } from '@/lib/mongodb'
import Item from '@/models/Item'
import ItemsGrid from '@/components/ItemsGrid'
import Header from '@/components/Header'
import Hero from '@/components/Hero'
import Footer from '@/components/Footer'
import DailyBanner from '@/components/DailyBanner'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  await connectDB()
  const total = await Item.countDocuments({ status: 'published' })

  return (
    <>
      <Header total={total} />
      <Hero />
      <DailyBanner />
      <ItemsGrid />
      <Footer />
    </>
  )
}
```

**Step 3: Create `components/ItemsGrid.tsx` (client component with search/filter)**

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import ItemCard from './ItemCard'
import { CATEGORIES } from '@/lib/theme'

export default function ItemsGrid() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [cat, setCat] = useState('全部')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('d')

  const fetchItems = useCallback(async () => {
    const params = new URLSearchParams({ cat, q, sort, limit: '200' })
    const res = await fetch(`/api/items?${params}`)
    const data = await res.json()
    setItems(data.items)
    setTotal(data.total)
  }, [cat, q, sort])

  useEffect(() => { fetchItems() }, [fetchItems])

  return (
    <>
      {/* Stats bar */}
      <div className="stats">
        <div className="stats-in">
          <div className="stat"><div className="stat-l">ITEMS</div><div className="stat-v">{total}</div></div>
          <div className="stat"><div className="stat-l">CATEGORIES</div><div className="stat-v">8</div></div>
        </div>
      </div>

      {/* Controls */}
      <div className="ctrl">
        <div className="ctrl-in">
          <div className="srch">
            <span className="srch-ic">◈</span>
            <input
              type="text"
              placeholder="搜索物件名或文案关键词…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="chips">
            <button
              className={`chip ${cat === '全部' ? 'on' : ''}`}
              onClick={() => setCat('全部')}
            >全部</button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={`chip ${cat === c ? 'on' : ''}`}
                data-c={c}
                onClick={() => setCat(c)}
              >{c}</button>
            ))}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="sort">
            <option value="d">默认排序</option>
            <option value="l">最多喜欢</option>
            <option value="n">最新收录</option>
          </select>
        </div>
      </div>

      {/* Result bar */}
      <div className="rbar">
        <div>显示 <strong>{items.length}</strong> 条物语</div>
        {cat !== '全部' && <div>当前：{cat}</div>}
      </div>

      {/* Grid */}
      <div className="grid-wrap">
        <div className="grid">
          {items.map((item: any) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
        {items.length === 0 && (
          <div className="empty show">
            <div style={{ fontSize: 40 }}>◻</div>
            <p>没有找到匹配的物语</p>
          </div>
        )}
      </div>
    </>
  )
}
```

**Step 4: Port remaining CSS from `demo.html`** (header, hero, stats, ctrl, chip, sort, rbar, grid, empty, footer styles) into `app/globals.css`.

**Step 5: Start dev server and verify homepage renders correctly**

```bash
npm run dev
```

Open `http://localhost:3000` — should look identical to `demo.html`.

**Step 6: Commit**

```bash
git add app/ components/
git commit -m "feat: homepage with server-rendered shell and client ItemsGrid"
```

---

## Phase 5: Special Features

---

### Task 17: Gacha system

**Files:**
- Create: `lib/gacha.ts`
- Create: `lib/__tests__/gacha.test.ts`
- Create: `app/api/gacha/route.ts`
- Create: `app/gacha/page.tsx`
- Create: `components/GachaModal.tsx`

**Step 1: Write failing tests — `lib/__tests__/gacha.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { drawRarity, draw10 } from '../gacha'

describe('gacha', () => {
  it('drawRarity returns ssr/rare/common based on rates', () => {
    // Run 1000 times, check distribution is roughly right
    const results = Array.from({ length: 1000 }, () => drawRarity(5, 25))
    const ssrCount = results.filter((r) => r === 'ssr').length
    const rareCount = results.filter((r) => r === 'rare').length
    expect(ssrCount).toBeLessThan(100) // ~5%
    expect(rareCount).toBeLessThan(350) // ~25%
  })

  it('draw10 guarantees at least one rare or better', () => {
    for (let i = 0; i < 50; i++) {
      const results = draw10(5, 25)
      expect(results.length).toBe(10)
      const hasRareOrBetter = results.some((r) => r === 'rare' || r === 'ssr')
      expect(hasRareOrBetter).toBe(true)
    }
  })
})
```

**Step 2: Run — expect FAIL**

```bash
npm run test:run -- lib/__tests__/gacha.test.ts
```

**Step 3: Implement `lib/gacha.ts`**

```typescript
export type Rarity = 'common' | 'rare' | 'ssr'

export function drawRarity(ssrRate: number, rareRate: number): Rarity {
  const roll = Math.random() * 100
  if (roll < ssrRate) return 'ssr'
  if (roll < ssrRate + rareRate) return 'rare'
  return 'common'
}

export function draw10(ssrRate: number, rareRate: number): Rarity[] {
  const results: Rarity[] = Array.from({ length: 10 }, () => drawRarity(ssrRate, rareRate))
  // Guarantee at least one rare+
  const hasRarePlus = results.some((r) => r === 'rare' || r === 'ssr')
  if (!hasRarePlus) {
    const idx = Math.floor(Math.random() * 10)
    results[idx] = 'rare'
  }
  return results
}
```

**Step 4: Run tests — expect PASS**

```bash
npm run test:run -- lib/__tests__/gacha.test.ts
```

**Step 5: Implement `app/api/gacha/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Item from '@/models/Item'
import Config from '@/models/Config'
import { drawRarity, draw10 } from '@/lib/gacha'

export async function POST(req: NextRequest) {
  await connectDB()
  const { mode } = await req.json() // "single" | "ten"

  const configs = await Config.find({ key: { $in: ['gacha_ssr_rate', 'gacha_rare_rate'] } })
  const ssrRate = (configs.find((c) => c.key === 'gacha_ssr_rate')?.value as number) ?? 5
  const rareRate = (configs.find((c) => c.key === 'gacha_rare_rate')?.value as number) ?? 25

  const rarities = mode === 'ten'
    ? draw10(ssrRate, rareRate)
    : [drawRarity(ssrRate, rareRate)]

  const results = await Promise.all(
    rarities.map(async (rarity) => {
      const count = await Item.countDocuments({ rarity, status: 'published' })
      if (count === 0) {
        // fallback to common
        const fallbackCount = await Item.countDocuments({ status: 'published' })
        const item = await Item.findOne({ status: 'published' }).skip(
          Math.floor(Math.random() * fallbackCount)
        )
        return { ...item!.toObject(), drawnRarity: 'common' }
      }
      const item = await Item.findOne({ rarity, status: 'published' }).skip(
        Math.floor(Math.random() * count)
      )
      return { ...item!.toObject(), drawnRarity: rarity }
    })
  )

  return NextResponse.json(results)
}
```

**Step 6: Create `app/gacha/page.tsx`** — Full-screen gacha UI with pixel animation, pull button, result cards. Port styling from design spec.

**Step 7: Commit**

```bash
git add lib/gacha.ts lib/__tests__/gacha.test.ts app/api/gacha/ app/gacha/
git commit -m "feat: gacha system with rarity draws, 10-pull guarantee, and gacha page"
```

---

### Task 18: Share card image generation

**Files:**
- Create: `app/api/share/[id]/route.ts`

**Step 1: Install satori**

```bash
npm install satori
```

**Step 2: Implement `app/api/share/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { connectDB } from '@/lib/mongodb'
import Item from '@/models/Item'
import { CAT_COLORS } from '@/lib/theme'
import fs from 'fs'
import path from 'path'

// Load font
const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSerifSC-Regular.otf')
const fontData = fs.readFileSync(fontPath)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB()
  const { id } = await params
  const item = await Item.findOne({ id, status: 'published' })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ratio = new URL(req.url).searchParams.get('ratio') ?? '1:1'
  const width = 800
  const height = ratio === '9:16' ? 1422 : 800
  const accent = CAT_COLORS[item.cat] ?? '#d96c30'

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width,
          height,
          background: '#1e150a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 60,
          fontFamily: 'NotoSerifSC',
          position: 'relative',
        },
        children: [
          // Category accent line
          { type: 'div', props: { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: accent } } },
          // Item name
          { type: 'div', props: { style: { color: '#faf4e8', fontSize: 32, fontWeight: 700, marginBottom: 24 }, children: item.name } },
          // Text quote
          { type: 'div', props: { style: { color: '#8a7258', fontSize: 22, lineHeight: 2, textAlign: 'center', maxWidth: 600, borderLeft: `6px solid ${accent}`, paddingLeft: 20 }, children: item.text } },
          // Watermark
          { type: 'div', props: { style: { position: 'absolute', bottom: 30, color: '#4a3520', fontSize: 14 }, children: '✦ 像素物语 · PIXEL TALES ✦' } },
        ],
      },
    },
    {
      width,
      height,
      fonts: [{ name: 'NotoSerifSC', data: fontData, weight: 400, style: 'normal' }],
    }
  )

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
  const png = resvg.render().asPng()

  return new NextResponse(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
```

> **Note:** Download `NotoSerifSC-Regular.otf` and place it in `public/fonts/`. Also install: `npm install @resvg/resvg-js`

**Step 3: Commit**

```bash
git add app/api/share/
git commit -m "feat: share card PNG generation with satori + resvg"
```

---

### Task 19: Immersive reading mode

**Files:**
- Create: `app/read/page.tsx`

**Step 1: Implement `app/read/page.tsx`**

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import PixelIcon from '@/components/PixelIcon'
import { CAT_COLORS } from '@/lib/theme'
import Link from 'next/link'

export default function ReadPage() {
  const searchParams = useSearchParams()
  const cat = searchParams.get('cat') ?? '全部'

  const [items, setItems] = useState<any[]>([])
  const [index, setIndex] = useState(0)
  const current = items[index]

  useEffect(() => {
    const params = new URLSearchParams({ limit: '200' })
    if (cat !== '全部') params.set('cat', cat)
    fetch(`/api/items?${params}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items))
  }, [cat])

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const next = useCallback(() => setIndex((i) => Math.min(items.length - 1, i + 1)), [items.length])
  const random = useCallback(() => setIndex(Math.floor(Math.random() * items.length)), [items.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === ' ') { e.preventDefault(); random() }
      else if (e.key === 'Escape') window.history.back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, random])

  if (!current) return <div style={{ background: '#1e150a', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a7258' }}>加载中…</div>

  const accent = CAT_COLORS[current.cat] ?? 'var(--og)'

  return (
    <div className="read-wrap" style={{ '--accent': accent } as React.CSSProperties}>
      {/* Background */}
      <div className="read-bg" style={{ background: `radial-gradient(ellipse at center, ${accent}22 0%, #1e150a 70%)` }} />

      {/* Card */}
      <div className="read-card">
        <div className="read-icon">
          <PixelIcon icon={current.icon} image={current.image} size={56} />
        </div>
        <div className="read-name">{current.name}</div>
        <div className="read-cat" style={{ color: accent }}>{current.cat}</div>
        <div className="read-text">{current.text}</div>
      </div>

      {/* Controls */}
      <div className="read-nav">
        <button onClick={prev} disabled={index === 0}>←</button>
        <button onClick={random}>✦ 随机</button>
        <button onClick={next} disabled={index === items.length - 1}>→</button>
      </div>

      {/* Progress */}
      <div className="read-progress">
        <div className="read-bar" style={{ width: `${((index + 1) / items.length) * 100}%`, background: accent }} />
      </div>

      {/* Close */}
      <Link href="/" className="read-close">✕</Link>
    </div>
  )
}
```

Add `read-*` styles to `app/globals.css`.

**Step 2: Commit**

```bash
git add app/read/
git commit -m "feat: immersive reading mode with keyboard nav and swipe"
```

---

### Task 20: Submit / Creation Workshop

**Files:**
- Create: `app/submit/page.tsx`
- Create: `components/IconPicker.tsx`
- Create: `app/api/ai/polish/route.ts`
- Create: `app/api/upload/route.ts`

**Step 1: Implement AI polish API — `app/api/ai/polish/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { connectDB } from '@/lib/mongodb'
import Config from '@/models/Config'

export async function POST(req: NextRequest) {
  await connectDB()
  const enabledCfg = await Config.findOne({ key: 'ai_polish_enabled' })
  if (!enabledCfg?.value) {
    return NextResponse.json({ error: 'AI polish is disabled' }, { status: 403 })
  }

  const { name, text } = await req.json()
  if (!name || !text) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `你是一位擅长为小物件写短文案的中文作家。风格：温柔、克制、有余味，句子不超过60字。请将以下物件文案润色，只返回润色后的文案，不要解释：\n物件名：${name}\n原文案：${text}`,
      },
    ],
  })

  const polished = (message.content[0] as { type: 'text'; text: string }).text.trim()
  return NextResponse.json({ polished })
}
```

Install SDK: `npm install @anthropic-ai/sdk`

**Step 2: Implement upload API — `app/api/upload/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const processed = await sharp(buffer)
    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const hash = crypto.randomBytes(8).toString('hex')
  const filename = `${hash}.png`
  const uploadDir = path.join(process.cwd(), 'public', 'uploads')
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(uploadDir, filename), processed)

  return NextResponse.json({ url: `/uploads/${filename}` })
}
```

**Step 3: Implement `app/submit/page.tsx`** — Three-step form (icon selection → content → preview + submit) with Turnstile widget.

**Step 4: Commit**

```bash
git add app/submit/ app/api/ai/ app/api/upload/ components/IconPicker.tsx
git commit -m "feat: submission form with icon picker, AI polish, and upload"
```

---

### Task 21: Daily item cron + RSS

**Files:**
- Create: `lib/cron.ts`
- Create: `app/api/rss/route.ts`
- Modify: `app/layout.tsx` (start cron on server startup)

**Step 1: Implement `lib/cron.ts`**

```typescript
import cron from 'node-cron'
import { connectDB } from './mongodb'
import Daily from '@/models/Daily'
import Item from '@/models/Item'
import Config from '@/models/Config'

function todayString() {
  return new Date().toISOString().split('T')[0]
}

export function startCron() {
  // Run at midnight every day
  cron.schedule('0 0 * * *', async () => {
    try {
      await connectDB()
      const autoCfg = await Config.findOne({ key: 'daily_auto' })
      if (!autoCfg?.value) return

      const today = todayString()
      const existing = await Daily.findOne({ date: today })
      if (existing) return

      const count = await Item.countDocuments({ status: 'published' })
      const item = await Item.findOne({ status: 'published' }).skip(
        Math.floor(Math.random() * count)
      )
      if (item) {
        await Daily.create({ date: today, itemId: item._id })
        console.log(`[cron] Daily item set for ${today}: ${item.name}`)
      }
    } catch (err) {
      console.error('[cron] Failed to set daily item:', err)
    }
  })
  console.log('[cron] Daily item scheduler started')
}
```

**Step 2: Start cron in `instrumentation.ts`** (Next.js server startup hook)

Create `instrumentation.ts` in project root:
```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCron } = await import('./lib/cron')
    startCron()
  }
}
```

Enable in `next.config.ts`:
```typescript
const config = {
  experimental: { instrumentationHook: true },
}
export default config
```

**Step 3: Implement RSS — `app/api/rss/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/mongodb'
import Item from '@/models/Item'

export async function GET() {
  await connectDB()
  const items = await Item.find({ status: 'published' }).sort({ createdAt: -1 }).limit(20)

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>像素物语</title>
    <link>https://your-domain.com</link>
    <description>每件小东西，都藏着一句话</description>
    ${items.map((item) => `
    <item>
      <title>${item.name}</title>
      <description><![CDATA[${item.text}]]></description>
      <guid>${item.id}</guid>
    </item>`).join('')}
  </channel>
</rss>`

  return new NextResponse(rss, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
```

**Step 4: Commit**

```bash
git add lib/cron.ts instrumentation.ts app/api/rss/ next.config.ts
git commit -m "feat: daily item cron job and RSS feed"
```

---

## Phase 6: Admin Frontend

---

### Task 22: Admin login page

**Files:**
- Create: `app/admin/login/page.tsx`

**Step 1: Implement**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (res.ok) {
      router.push('/admin')
    } else {
      setError('用户名或密码错误')
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <div className="logo" style={{ marginBottom: 24 }}>
          <div className="logo-sq"><b /><b /><b /><b /></div>
          像素物语管理后台
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="admin-error">{error}</div>}
          <button type="submit" className="btn-a" style={{ width: '100%' }}>登录</button>
        </form>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add app/admin/login/
git commit -m "feat: admin login page"
```

---

### Task 23: Admin dashboard, items, submissions, config pages

**Files:**
- Create: `app/admin/page.tsx` (dashboard)
- Create: `app/admin/items/page.tsx`
- Create: `app/admin/submissions/page.tsx`
- Create: `app/admin/config/page.tsx`
- Create: `app/admin/layout.tsx`

**Step 1: Create `app/admin/layout.tsx`**

```tsx
import AdminNav from '@/components/admin/AdminNav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-wrap">
      <AdminNav />
      <main className="admin-main">{children}</main>
    </div>
  )
}
```

**Step 2: Implement dashboard, items CRUD table, submissions review, and config form** following the design doc section VII. Each page is a client component fetching from its respective `/api/admin/*` endpoint.

Key interactions:
- **Items page:** DataTable with search, inline edit modal, delete confirm dialog
- **Submissions page:** Three-column kanban (pending/approved/rejected), approve/reject actions
- **Config page:** Simple key-value form with toggle switches

**Step 3: Commit**

```bash
git add app/admin/ components/admin/
git commit -m "feat: admin dashboard, items CRUD, submissions review, config UI"
```

---

## Phase 7: Docker

---

### Task 24: Dockerfile + Docker Compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Step 1: Create `Dockerfile`**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

**Step 2: Enable standalone output in `next.config.ts`**

```typescript
const config = {
  output: 'standalone',
  experimental: { instrumentationHook: true },
}
export default config
```

**Step 3: Create `docker-compose.yml`**

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    volumes:
      - uploads:/app/public/uploads
    depends_on:
      mongo:
        condition: service_healthy
    restart: unless-stopped

  mongo:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  mongo_data:
  uploads:
```

**Step 4: Create `.dockerignore`**

```
node_modules
.next
.env.local
.git
docs
```

**Step 5: Build and test locally**

```bash
docker compose build
docker compose up -d
```

Open `http://localhost:3000` — verify app runs.

Run seed against dockerized mongo:

```bash
MONGODB_URI=mongodb://localhost:27017/pixel-tales npm run seed
```

**Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore next.config.ts
git commit -m "feat: Docker production setup with standalone Next.js output"
```

---

## Final Checklist

- [ ] `npm run test:run` — all tests pass
- [ ] `npm run build` — no TypeScript errors
- [ ] `docker compose up` — app starts, MongoDB connects
- [ ] `npm run seed` — 108 items imported successfully
- [ ] Homepage renders identical to `demo.html`
- [ ] Admin login works with `.env` credentials
- [ ] Like / submit / gacha APIs respond correctly
- [ ] Share card PNG endpoint returns valid image
- [ ] RSS feed validates at `https://validator.w3.org/feed/`

---

*Plan written: 2026-03-04. Next: execute task-by-task.*
