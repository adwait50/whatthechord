import 'dotenv/config'
import * as fs from "fs"
import * as path from "path"
import puppeteer, { Browser } from "puppeteer"
import { Prisma, PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

// ---- PRISMA CLIENT ----

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const prisma = createPrismaClient()
const MAX_PARSE_RETRIES = 3

// ---- HELPERS ----

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

function extractSongId(url: string): string {
  const match = url.match(/songId=(\d+)/) || url.match(/\/song\/(\d+)/)
  return match ? match[1] : Date.now().toString()
}

// ---- PARSE INLINE CHORD+LYRIC TEXT ----
// The page text looks like:
// "[Bm]Aankhon Mein Basey Ho Tum,"
// "[A]Jab Chahun Tumhen Dekhun,"
// We parse each line by splitting on [ChordName] markers

function parseChordLines(rawText: string): {
  chords: string[]
  lyricLines: { chord: string | null; lyric: string; rawContent: string }[]
} {
  const chordsUsed = new Set<string>()
  const lyricLines: { chord: string | null; lyric: string; rawContent: string }[] = []

  const lines = rawText.split("\n")

  for (const originalLine of lines) {
    const line = originalLine

    // Skip navigation/UI lines
    if (
      line.startsWith("Download Indichords") ||
      line.startsWith("Transpose") ||
      line.startsWith("Related Songs") ||
      line.startsWith("Trending") ||
      line.startsWith("http")
    ) {
      continue
    }

    // collect any chords present
    const chordMatches = Array.from(line.matchAll(/\[([A-G][^\]]{0,5})\]/g))
    for (const m of chordMatches) {
      chordsUsed.add(m[1])
    }

    // always push line, even if blank, to preserve gaps
    lyricLines.push({
      chord: chordMatches[0]?.[1] || null,
      lyric: line,
      rawContent: line,
    })
  }

  return {
    chords: Array.from(chordsUsed),
    lyricLines,
  }
}

// ---- PARSE A SINGLE SONG PAGE ----

async function parseSongPage(browser: Browser, url: string) {
  const page = await browser.newPage()

  // Block ads and trackers to speed up loading
  await page.setRequestInterception(true)
  page.on("request", (req) => {
    const blocked = [
      "googlesyndication",
      "googletagmanager",
      "google-analytics",
      "adsbygoogle",
      "doubleclick",
      "ureka",
      "cse.google",
      "pagead",
    ]
    if (blocked.some((b) => req.url().includes(b))) {
      req.abort()
    } else {
      req.continue()
    }
  })

  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })

    // Wait for JS to render the song content
    await new Promise((r) => setTimeout(r, 3000))

    const pageData = await page.evaluate(() => {
      // First h1 = site logo "Indichords", last h1 = song title
      const h1s = Array.from(document.querySelectorAll("h1"))
      const title = h1s[h1s.length - 1]?.textContent?.trim() || ""

      // Artist info is in <p class="song-meta">
      const artistRaw =
        document.querySelector(".song-meta")?.textContent?.trim() || ""

      // Full page text — chords and lyrics are inline here
      const bodyText = document.body.innerText

      return { title, artistRaw, bodyText }
    })

    const { title, artistRaw, bodyText } = pageData

    if (!title || title.toLowerCase() === "indichords") {
      return null
    }

    // Parse artists from "artist1-artist2-artist3" slug format
    const artists = artistRaw
      .split(/[,&-]/)
      .map((a: string) => a.trim())
      .filter((a: string) => a.length > 0)

    // Isolate the song content section
    // Content starts after "Download Indichords" promo text
    // Content ends before "Related Songs"
    const contentStart = bodyText.indexOf("Download Indichords")
    const contentEnd = bodyText.indexOf("Related Songs")

    const songContent =
      contentStart !== -1
        ? bodyText.slice(
            contentStart,
            contentEnd !== -1 ? contentEnd : undefined
          )
        : bodyText

    const { chords, lyricLines } = parseChordLines(songContent)

    // Append songId to slug to guarantee uniqueness
    const songId = extractSongId(url)
    const slug = `${slugify(title)}-${songId}`

    return {
      title,
      slug,
      sourceUrl: url,
      language: "hindi",
      decade: null as string | null,
      artists,
      chords,
      lyricLines,
    }
  } catch (err) {
    throw err
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => {})
    }
  }
}

// ---- SAVE A SONG TO DATABASE ----

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

function isTransientScrapeError(error: unknown): boolean {
  const message = String(error ?? "")
  const transientPatterns = [
    "ERR_NETWORK_CHANGED",
    "ERR_CONNECTION_RESET",
    "ERR_CONNECTION_CLOSED",
    "ERR_TIMED_OUT",
    "ERR_NAME_NOT_RESOLVED",
    "Navigation timeout",
    "Protocol error",
    "Target closed",
    "Session closed",
  ]
  return transientPatterns.some((pattern) => message.includes(pattern))
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function parseSongPageWithRetry(browser: Browser, url: string) {
  for (let attempt = 1; attempt <= MAX_PARSE_RETRIES; attempt++) {
    try {
      return await parseSongPage(browser, url)
    } catch (error) {
      if (!isTransientScrapeError(error) || attempt === MAX_PARSE_RETRIES) {
        throw error
      }
      const backoffMs = 1200 * attempt
      console.log(`retry ${attempt}/${MAX_PARSE_RETRIES} after transient error...`)
      await delay(backoffMs)
    }
  }

  return null
}

async function upsertArtistSafely(name: string) {
  const slug = slugify(name)
  try {
    return await prisma.artist.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    })
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      const existing = await prisma.artist.findUnique({ where: { slug } })
      if (existing) return existing
    }
    throw error
  }
}

async function upsertChordSafely(name: string) {
  try {
    return await prisma.chord.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      const existing = await prisma.chord.findUnique({ where: { name } })
      if (existing) return existing
    }
    throw error
  }
}

async function saveSong(
  data: NonNullable<Awaited<ReturnType<typeof parseSongPage>>>
) {
  const uniqueArtists = Array.from(
    new Map(
      data.artists.map((name) => {
        const trimmed = name.trim()
        return [slugify(trimmed), trimmed]
      })
    ).entries()
  )
    .filter(([slug]) => slug.length > 0)
    .map(([, name]) => name)

  // Upsert artists safely (handles duplicate-slug races)
  const artistRecords: Array<{ id: number }> = []
  for (const name of uniqueArtists) {
    const artist = await upsertArtistSafely(name)
    artistRecords.push(artist)
  }

  // Upsert chords safely
  const chordRecords: Array<{ id: number }> = []
  for (const name of data.chords) {
    const chord = await upsertChordSafely(name)
    chordRecords.push(chord)
  }

  // Upsert song
  const song = await prisma.song.upsert({
    where: { sourceUrl: data.sourceUrl },
    update: {},
    create: {
      title: data.title,
      slug: data.slug,
      sourceUrl: data.sourceUrl,
      language: data.language,
      decade: data.decade,
    },
  })

  // Link artists to song preserving order
  await Promise.all(
    artistRecords.map((artist, idx) =>
      prisma.songArtist.upsert({
        where: {
          songId_artistId: { songId: song.id, artistId: artist.id },
        },
        update: { position: idx },
        create: { songId: song.id, artistId: artist.id, position: idx },
      })
    )
  )

  // Link chords to song
  await Promise.all(
    chordRecords.map((chord) =>
      prisma.songChord.upsert({
        where: {
          songId_chordId: { songId: song.id, chordId: chord.id },
        },
        update: {},
        create: { songId: song.id, chordId: chord.id },
      })
    )
  )

  // Delete old lyric lines and reinsert fresh
  await prisma.lyricLine.deleteMany({ where: { songId: song.id } })
  await prisma.lyricLine.createMany({
    data: data.lyricLines.map((line, index) => ({
      songId: song.id,
      lineIndex: index,
      lyric: line.lyric,
      chord: line.chord,
      rawContent: line.rawContent,
    })),
  })

  return song
}

// ---- RESUME HELPERS ----
// progress.txt tracks every successfully scraped URL, one per line.
// On restart, we load this set and skip any URL already in it.

const progressPath = path.join(__dirname, "progress.txt")

function loadProgress(): Set<string> {
  if (!fs.existsSync(progressPath)) return new Set()
  const lines = fs
    .readFileSync(progressPath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  return new Set(lines)
}

function markDone(url: string) {
  fs.appendFileSync(progressPath, url + "\n", "utf-8")
}

// ---- MAIN ----

async function main() {
  const urlsPath = path.join(__dirname, "urls.txt")

  if (!fs.existsSync(urlsPath)) {
    console.error("❌ No urls.txt found at scripts/urls.txt")
    process.exit(1)
  }

  const allUrls = fs
    .readFileSync(urlsPath, "utf-8")
    .split("\n")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http"))

  // Load already-scraped URLs and skip them
  const done = loadProgress()
  const remainingUrls = allUrls.filter((u) => !done.has(u))
  const scrapeLimit = Number(process.env.SCRAPE_LIMIT || "0")
  const urls =
    Number.isFinite(scrapeLimit) && scrapeLimit > 0
      ? remainingUrls.slice(0, scrapeLimit)
      : remainingUrls

  console.log(`📋 Total URLs:     ${allUrls.length}`)
  console.log(`✅ Already done:   ${done.size}`)
  console.log(`⏳ Remaining:      ${remainingUrls.length}`)
  if (Number.isFinite(scrapeLimit) && scrapeLimit > 0) {
    console.log(`🧪 This run limit: ${urls.length}`)
  }
  console.log("")

  if (urls.length === 0) {
    console.log("🎸 All songs already scraped!")
    process.exit(0)
  }

  // Use let so we can relaunch browser if it crashes
  let browser = await puppeteer.launch({ headless: true })

  let success = 0
  let failed = 0

  // Handle Ctrl+C gracefully — close browser before exiting
  process.on("SIGINT", async () => {
    console.log("\n\n⚠️  Interrupted! Progress saved — rerun to continue.")
    await browser.close()
    await prisma.$disconnect()
    process.exit(0)
  })

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    const overall = done.size + i + 1

    process.stdout.write(
      `[${overall}/${allUrls.length}] ${url.slice(0, 50)}... `
    )

    try {
      const data = await parseSongPageWithRetry(browser, url)

      if (!data) {
        console.log("⚠️  skipped (could not parse)")
        // Mark as done so we don't retry endlessly
        markDone(url)
        failed++
        continue
      }

      await saveSong(data)
      console.log(`✅ "${data.title}" — ${data.chords.length} chords`)

      // Mark this URL as done immediately after saving
      markDone(url)
      success++

      // 1 second delay between requests
      await delay(1000)
    } catch (err: unknown) {
      console.log(`❌ Error scraping ${url}`)
      if (err instanceof Error) {
        console.error(err.stack ?? err.message)
      } else {
        console.error(err)
      }
      // Don't mark failed URLs as done — they'll be retried on next run
      failed++

      // Wait a bit longer after an error before continuing
      await delay(2000)

      // Check if browser is still alive — relaunch if it crashed
      try {
        await browser.version()
      } catch {
        console.log("🔄 Browser crashed — relaunching...")
        browser = await puppeteer.launch({ headless: true })
      }
    }
  }

  await browser.close()
  await prisma.$disconnect()

  console.log(`\n🎸 Session complete!`)
  console.log(`   ✅ ${success} saved this run`)
  console.log(`   ❌ ${failed} failed (will retry on next run)`)
  console.log(`   📦 Total in DB: ${done.size + success}`)
}

main()
