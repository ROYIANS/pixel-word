# 像素物语 · Pixel Tales

> 每件小东西，都藏着一句话

A pixel-art themed Chinese copywriting library — 108 poetic short texts for everyday objects, built with Next.js 15.

## Features

- 📚 108 original pixel-art quote cards across 8 categories
- 🎮 Gacha system with SSR/R/N rarity tiers
- 🖼️ Share card generator (1:1 & 9:16 PNG)
- 📖 Immersive full-screen reading mode
- ✍️ Community submissions with AI polish (Claude)
- 🌅 Daily featured object with RSS & email subscription
- 🔧 Admin panel — CRUD, submission review, site config
- 🐳 Docker Compose deployment

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router) |
| Database | MongoDB 7 + Mongoose |
| Icons | Iconify (pixel-art set) |
| Auth | bcrypt + JWT (httpOnly cookie) |
| Anti-spam | Cloudflare Turnstile |
| AI | Claude Haiku (text polish) |
| Images | Sharp + Satori (share cards) |
| Deploy | Docker Compose |

## Quick Start

### Development

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env.local
# Fill in MONGODB_URI (local MongoDB required)

# 3. Seed database
npm run seed

# 4. Start dev server
npm run dev
```

### Production (Docker)

```bash
# Copy and fill .env
cp .env.example .env

# Generate admin password hash
node -e "const b=require('bcryptjs'); b.hash('your-password',12).then(console.log)"
# Paste hash into .env as ADMIN_PASSWORD_HASH

# Build and start
docker compose up -d

# Seed (first run only)
docker compose exec app npm run seed
```

## Project Structure

```
pixel-word/
├── app/                    # Next.js App Router
│   ├── (public)/           # Public pages
│   ├── admin/              # Admin panel
│   └── api/                # API routes
├── components/             # React components
├── lib/                    # Utilities (db, auth, etc.)
├── models/                 # Mongoose models
├── scripts/                # CLI scripts (seed, etc.)
├── docs/plans/             # Design & implementation docs
├── public/                 # Static assets
├── docker-compose.yml
└── Dockerfile
```

## Admin Setup

Admin credentials are set via environment variables (no registration):

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt hash of your password>
```

Access admin panel at `/admin`.

## License

MIT
