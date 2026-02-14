# WhatTheChord 🎸

> Find songs you can actually play — based on the chords you already know.

A guitar chord web app built with Next.js 15, TypeScript, PostgreSQL, and Clerk.

## The USP
Unlike Ultimate Guitar, WhatTheChord lets you select the chords you know and filters songs to only show what's immediately playable for you. It also shows songs you're "one chord away" from playing.

## Tech Stack
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL via Prisma ORM (hosted on Supabase)
- **Auth:** Clerk
- **Data:** Scraped from IndiChords using Puppeteer

## Features (MVP)
- [ ] Chord filter — select known chords, get matching songs
- [ ] One chord away — songs you're closest to playing
- [ ] Decade/era filter
- [ ] Song pages with inline chords + diagrams
- [ ] Progression-based recommendations
- [ ] Save songs + manage known chords

## Dev Log
See [DEVLOG.md](./DEVLOG.md) for detailed notes on architecture decisions and problems solved.

## Setup
\`\`\`bash
npm install
cp .env.example .env  # add your DATABASE_URL and Clerk keys
npx prisma db push
npm run dev
\`\`\`