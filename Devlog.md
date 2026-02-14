# WhatTheChord — Developer Journal

> A full-stack guitar chord web app built with Next.js 15, TypeScript, PostgreSQL (Prisma), and Clerk.
> This document tracks every major decision, problem encountered, and how it was solved.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack Decisions](#2-tech-stack-decisions)
3. [Feature Planning](#3-feature-planning)
4. [Setup & Scaffolding](#4-setup--scaffolding)
5. [Database Design](#5-database-design)
6. [The Scraper](#6-the-scraper)
7. [Problems & Solutions](#7-problems--solutions)
8. [Lessons Learned](#8-lessons-learned)

---

## 1. Project Overview

**WhatTheChord** is a guitar chord and lyrics web app — similar to Ultimate Guitar — but with a core USP that no existing app does well:

> *"Select the chords you know → see only the songs you can actually play."*

### The Problem with Existing Apps
Ultimate Guitar and similar sites show you millions of songs, but there's no way to filter by the chords you already know. A beginner who knows Am, C, G, and Em has no way to discover which songs are immediately playable for them. WhatTheChord solves this.

### Core MVP Features
- **Chord filter** — select known chords, get matching songs instantly
- **"One chord away"** — songs you're closest to playing, ranked by most-unlocking missing chord
- **Decade/era filter** — layered on top of chord filter
- **Song pages** — full lyrics with inline chord positions + chord diagrams
- **Progression-based recommendations** — songs with similar chord progressions
- **User accounts** — save songs, manage your known chords list

### Why This is Technically Interesting (GSoC Angle)
Each feature maps to a real CS concept:

| Feature | Concept |
|---|---|
| Chord set-intersection filter | Set theory, SQL optimization |
| "One chord away" ranking | Greedy algorithms |
| Progression recommendations | Sequence similarity matching |
| Scraper + data pipeline | ETL (Extract, Transform, Load) |
| Full-stack architecture | Monorepo, API design, ORM patterns |

---

## 2. Tech Stack Decisions

### Frontend
**Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui**

- **Next.js App Router** over Pages Router because App Router is the modern standard (2023+). It uses React Server Components — pages fetch their own data on the server, making them faster and cleaner.
- **TypeScript** because it catches mistakes at compile time, not runtime. Critical when learning a new stack.
- **Tailwind CSS** for utility-first styling — no context switching between CSS files.
- **shadcn/ui** — unlike traditional UI libraries, shadcn copies components directly into your codebase as code you own. No version lock-in, fully customizable.

### Backend
**Next.js API Routes** (same repo, same language as frontend)

Keeping backend and frontend in one Next.js monorepo means one deployment, one language (TypeScript), and cleaner imports. No separate Express server to manage.

### Database
**PostgreSQL via Prisma ORM on Supabase**

- **PostgreSQL over MongoDB** because the chord filter requires complex set-intersection queries. Relational databases handle this far better than document stores.
- **Prisma ORM** over raw SQL because it generates TypeScript types from your schema — your editor autocompletes database queries and catches mistakes before you even run the code.
- **Supabase** over local PostgreSQL because setting up PostgreSQL locally on Windows is painful, and Supabase gives a free cloud PostgreSQL instance that's identical to production.

### Auth
**Clerk** — handles login, signup, sessions, and user management in ~15 minutes of setup. Building auth from scratch would take weeks and introduce security risks.

### Data Source
**IndiChords** (indichords.com) — a community guitar chord site focused on Hindi/Bollywood songs. We have a list of ~2500 song URLs to scrape.

---

## 3. Feature Planning

### MVP (Phase 1)
- Known chord selector → playable songs filter
- "One chord away" — songs you're closest to, ranked by most-unlocking missing chord
- Decade/era filter
- Song pages with lyrics + inline chords + chord diagrams
- Progression-based song recommendations
- Save songs + manage known chords (auth via Clerk)

### V2 (Explicitly planned, not built yet)
- Chord substitution suggester (e.g. F → Fmaj7 for beginners)
- Capo calculator ("put capo on fret 2 and this song uses only your known chords")
- Full learning path generator
- Gamification (streaks, badges)
- AI chord detection from YouTube/audio
- Community chord corrections

### Features Deliberately Cut from MVP
**Chord substitution and Capo calculator** were originally planned for MVP but cut because:
- Chord substitution depends on the song's key and the chord's role in the progression — a hardcoded rule like "F → Fmaj7" sounds wrong ~30% of the time
- Capo calculator requires music theory transposition logic across all 12 keys
- Both are rabbit holes that would delay shipping a working MVP

Good product decisions: cut features that aren't core to the USP and add complexity disproportionate to their value.

---

## 4. Setup & Scaffolding

### Creating the Next.js App
```bash
npx create-next-app@latest whatthechord
```

Choices made during setup:
- TypeScript: **Yes**
- ESLint: **Yes**
- Tailwind CSS: **Yes**
- src/ directory: **No** (keeps paths simpler)
- App Router: **Yes** (modern standard)
- React Compiler: **No** (experimental, not stable enough)

### Installing Dependencies
```bash
npm install @clerk/nextjs @prisma/client prisma lucide-react clsx tailwind-merge
npx shadcn@latest init
npm install puppeteer
npm install dotenv
npm install @prisma/adapter-pg pg
npm install --save-dev @types/pg tsx
```

### Key Files Created
```
whatthechord/
├── app/                    ← Pages and routes
├── components/ui/          ← shadcn components (auto-generated)
├── lib/
│   └── prisma.ts           ← Prisma client singleton
├── prisma/
│   └── schema.prisma       ← Database schema
├── prisma.config.ts        ← Prisma v7 config (new in v7)
├── scripts/
│   ├── scraper.ts          ← IndiChords scraper
│   ├── urls.txt            ← List of song URLs to scrape
│   └── progress.txt        ← Resume tracker (auto-generated)
└── .env                    ← DATABASE_URL (never commit this)
```

---

## 5. Database Design

### Schema Overview

```
Song          — core song data (title, slug, language, decade)
Artist        — artist names
SongArtist    — many-to-many join: one song has many artists
Chord         — unique chord names (Am, Dm, F, etc.)
SongChord     — many-to-many join: one song uses many chords ← CORE OF THE FILTER
LyricLine     — each line of lyrics with its associated chord
UserKnownChord — which chords each user knows ← OTHER HALF OF THE FILTER
SavedSong     — user bookmarks
```

### Why This Schema

**Many-to-many relationships** (SongArtist, SongChord, UserKnownChord) are the key pattern here. For example:
- A song can have multiple artists (Palak Muchhal AND Amaal Malik)
- An artist can have multiple songs
- Rather than duplicating data, we create a join table with just two foreign keys

**The chord filter query** (simplified):
```sql
-- Songs that ONLY use chords the user knows
SELECT s.* FROM songs s
WHERE NOT EXISTS (
  SELECT 1 FROM song_chords sc
  WHERE sc.song_id = s.id
  AND sc.chord_id NOT IN (
    SELECT chord_id FROM user_known_chords WHERE user_id = ?
  )
)
```
This is set-intersection logic — find songs whose chord set is a subset of the user's known chord set.

**userId is a String, not an Int** — Clerk generates string IDs like `user_2abc123xyz`, so UserKnownChord and SavedSong use String for userId.

**Slug uniqueness** — every song gets a URL-friendly slug. To avoid collisions (two songs with the same title), we append the song's source ID: `tu-aata-hai-seene-me-1573`.

---

## 6. The Scraper

### Goal
Read ~2500 IndiChords URLs from `scripts/urls.txt`, visit each page, extract song data, and save to PostgreSQL.

### Tools
- **Puppeteer** — headless Chrome browser (explained below why we needed this)
- **dotenv** — loads `.env` file in standalone scripts
- **Prisma** — saves data to PostgreSQL

### How It Works
1. Load all URLs from `urls.txt`
2. Load already-scraped URLs from `progress.txt` (resume feature)
3. For each remaining URL, open it in a headless browser
4. Wait 3 seconds for JavaScript to render the song content
5. Extract title, artists, chords, and lyrics from the page
6. Save everything to the database using upserts
7. Mark URL as done in `progress.txt`
8. Repeat with a 1-second delay between requests

### Chord Parsing Logic
IndiChords renders chords inline in the page text like:
```
[Bm]Aankhon Mein Basey Ho Tum,
[A]Jab Chahun Tumhen Dekhun,
[G]Aaina Banaa Lunga
```

We isolate the song content section (between "Download Indichords" and "Related Songs"), then for each line:
- If the line contains `[ChordName]` patterns → split by chord markers and extract chord + lyric
- If no chord markers → pure lyric line

Regex used: `/\[([A-G][^\]]{0,5})\]/` — matches chord names like `[Am]`, `[C#m]`, `[Bm7]`

### Resume Feature
With 2500 songs (~3 hours of scraping), the scraper can crash or be interrupted. We track progress in `progress.txt` — one successfully scraped URL per line. On restart, already-done URLs are skipped automatically. Failed URLs are NOT marked done so they get retried.

```
Ctrl+C → progress saved → rerun → picks up where it left off
```

---

## 7. Problems & Solutions

### Problem 1: Prisma v7 Breaking Changes
**What happened:** Running `npx prisma generate` threw:
```
Error: The datasource property `url` is no longer supported in schema files.
```
**Why:** We installed Prisma v7 (brand new), but the docs and examples online mostly show v6 syntax. In v7, the database URL moved from `schema.prisma` to a new `prisma.config.ts` file.

**Solution:** 
- Removed `url = env("DATABASE_URL")` from `schema.prisma`
- Created `prisma.config.ts` with the correct v7 structure:
```ts
import 'dotenv/config'
import { defineConfig, env } from "prisma/config"

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env("DATABASE_URL") },
})
```
- Also needed `import 'dotenv/config'` at the top because Prisma v7 no longer auto-loads `.env`

**Lesson:** Always check the version of a tool you're installing. When a major version (v6 → v7) changes, breaking changes are common. The official docs for the specific version are the source of truth.

---

### Problem 2: Supabase Connection Refused on Port 5432
**What happened:** `npx prisma db push` gave:
```
Error: P1001: Can't reach database server at db.xxx.supabase.co:5432
```
**Why:** Supabase has two connection modes — direct connection (port 5432, restricted) and connection pooler (port 6543, what external apps should use). We copied the wrong connection string.

**Solution:** In Supabase Dashboard → Settings → Database → Connection string, select the **Transaction pooler** URL (port 6543, hostname ends in `pooler.supabase.com`).

**Lesson:** Cloud database providers often have multiple connection endpoints for different use cases. Always use the connection pooler URL for application connections.

---

### Problem 3: Prisma Client Initialization Error
**What happened:** Running the scraper threw:
```
PrismaClientInitializationError: PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions
```
**Why:** Another Prisma v7 change — the client now requires a driver adapter to be passed explicitly. Our `lib/prisma.ts` was using the old v6 pattern of just `new PrismaClient()`.

**Solution:** Wrap PrismaClient with the `pg` adapter:
```ts
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
```

**Lesson:** When a library releases a major version, don't just update the package — read the migration guide. Prisma v7 changed several core APIs simultaneously.

---

### Problem 4: Scraper Extracting Wrong Song Title
**What happened:** The scraper saved all songs with the title "Indichords" and 0 chords.

**Why:** The site has two `<h1>` tags — the first is the site logo ("Indichords"), the second is the actual song title. Our code used `$("h1").first()` which grabbed the wrong one.

**Solution:** Use `$("h1").last()` to get the song title. Also appended the song's numeric ID to the slug to prevent collisions between songs with the same title:
```ts
const slug = `${slugify(title)}-${songId}` // e.g. "tu-aata-hai-seene-me-1573"
```

**Lesson:** Always inspect the actual HTML of the page you're scraping. Assumptions about structure ("the title is in the h1") are often wrong. Use browser DevTools or fetch the raw HTML and log it.

---

### Problem 5: Cheerio Found 0 Chord Tags
**What happened:** Even after fixing the title, chord count was 0. Our Cheerio scraper was looking for `<h6>` tags containing chords but finding nothing.

**Why:** We first thought chords were in `<h6>` tags based on the markdown-like rendering Claude.ai showed. But the actual site renders chords dynamically via JavaScript — the initial HTML sent by the server has no chord content at all. Cheerio only parses static HTML (what the server sends), not the JavaScript-rendered result.

**Diagnosis:** Added a debug script that printed the raw HTML — confirmed that the chord content was completely absent from the server response.

**Solution:** Switched from Axios + Cheerio to **Puppeteer**, which launches a real headless Chrome browser, executes JavaScript, and gives us the fully rendered page.

**Lesson:** Always check whether the content you want is in the initial HTML or loaded by JavaScript. Use browser DevTools → Network tab → look for `fetch`/`XHR` requests, or just view the page source (Ctrl+U) and search for your content. If it's not there, you need a headless browser.

---

### Problem 6: Puppeteer Timeout with `networkidle2`
**What happened:** Puppeteer threw a navigation timeout error when using `waitUntil: "networkidle2"`.

**Why:** `networkidle2` waits until there are fewer than 3 active network requests for 500ms. The page has persistent ad scripts (Google Ads, analytics) that keep making network requests indefinitely, so this condition is never met.

**Solution:** 
- Switched to `waitUntil: "domcontentloaded"` (fires when HTML is parsed, doesn't wait for all resources)
- Added a fixed 3-second wait after navigation for JS to render the chord content
- Blocked ad/analytics domains using `page.setRequestInterception(true)` to speed up loading

**Lesson:** `networkidle2` sounds like the "safest" option but it's actually the most fragile. For pages with ads and analytics, `domcontentloaded` + a fixed delay is more reliable.

---

### Problem 7: Chords Inline in Text, Not in HTML Tags
**What happened:** Even with Puppeteer, the chord selectors returned empty arrays. `document.querySelectorAll("h6")` found nothing.

**Why:** After inspecting `document.body.innerText`, we discovered the chords aren't in any HTML tags at all — they're embedded inline in the page text like `[Bm]Aankhon Mein Basey Ho Tum`. The site uses a JavaScript renderer that converts a custom text format into visible content, but doesn't wrap chords in semantic HTML elements.

**Diagnosis:** The key debug step was logging `document.body.innerText` (rendered text) vs `document.body.innerHTML` (HTML structure). The text had chords, the HTML tags didn't.

**Solution:** Parse `body.innerText` directly using regex instead of CSS selectors:
```ts
// Split line "[Bm]Aankhon Mein" by chord pattern
const parts = line.split(/\[([A-G][^\]]{0,5})\]/)
// Odd indices = chord names, even indices = lyric text
```

**Lesson:** Don't assume a website structures its content semantically. Always debug by logging the actual content you're getting, not the content you expect. `innerText` vs `innerHTML` is a critical distinction.

---

### Problem 8: Script Crashing Mid-Run
**What happened:** The scraper would exit early when one URL threw a network error, skipping remaining URLs.

**Why:** An unhandled error inside the loop was bubbling up and killing the process. Also, occasional HTTP2 protocol errors from the server would permanently kill the Puppeteer browser instance.

**Solution:** 
- Wrapped each URL in a try/catch that logs the error and continues to the next URL
- Added a 2-second delay after errors (server might need time to recover)
- Added browser health check after each error — if the browser crashed, relaunch it:
```ts
try {
  await browser.version()
} catch {
  browser = await puppeteer.launch({ headless: true })
}
```
- Changed `const browser` to `let browser` so it can be reassigned

**Lesson:** Long-running scripts need defensive error handling. Every external call (network request, database write) can fail. The script should log failures and continue, not crash.

---

## 8. Lessons Learned

**Check your tool versions.** Prisma v7 had multiple breaking changes from v6. Before installing any major library, check what version you're getting and whether there's a migration guide.

**Debug with raw data first.** Multiple problems here were solved by simply logging what we actually had (`body.innerText`, raw HTML, h1 counts) rather than assuming. Print first, assume never.

**Static vs dynamic content.** Before writing a scraper, always check if the content is in the page source or loaded by JavaScript. Ctrl+U in browser → Ctrl+F for your content. If it's not there, you need Puppeteer.

**Design for failure in long-running scripts.** A 3-hour scraping job will encounter network errors. Build resume, retry, and crash recovery from the start — not as an afterthought.

**Cut features to ship faster.** Chord substitution and capo calculator were good ideas that would have delayed MVP by weeks. Cutting them was the right call — they're documented in V2 so they're not forgotten.

**SQL is the right tool for set operations.** The core chord filter is a set-intersection problem. PostgreSQL handles this naturally and efficiently. MongoDB would have required application-level filtering which is slower and harder to optimize.

---

*Last updated: Project setup + scraper complete. Next: Next.js pages, API routes, and the chord filter UI.*