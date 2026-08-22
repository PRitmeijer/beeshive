# De Bee's Hive: Website

Eetcafé website built with **Next.js 15** and **Payload CMS 3** (self-hosted, SQLite).

## Features

- **CMS Admin Panel** at `/admin`: manage blog posts, gallery, menu, notifications, and mailing list
- **Immersive frontend** with parallax scrolling, hexagon animations, and smooth transitions
- **Mailing list** subscription with API endpoint
- **Notification banners** managed via CMS (info, offers, events, important)
- **Gallery** with category filtering and lightbox
- **Menu/Kaart** with dietary labels and category filtering
- **Blog** with rich text content
- **Contact** form

## Getting Started

```bash
cp .env.example .env
npm install
npm run dev
```

Visit `http://localhost:3000` for the site, `http://localhost:3000/admin` for the CMS.

On first visit to `/admin`, you'll create your admin account.

## Docker

```bash
docker compose up --build
```

## Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Set environment variables: `DATABASE_URI`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SITE_URL`

## Tech Stack

- Next.js 15 (App Router)
- Payload CMS 3 (embedded, SQLite)
- Tailwind CSS
- Framer Motion
- TypeScript
