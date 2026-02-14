import 'dotenv/config'
import * as fs from "fs"
import * as path from "path"
import puppeteer, { Browser } from "puppeteer"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

// ---- PRISMA CLIENT ----

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

const prisma = createPrismaClient()

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
  lyricLines: { chord: string | null; lyric: string }[]
} {
  const chordsUsed = new Set<string>()
  const lyricLines: { chord: string | null; lyric: string }[] = []

  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean)

  for (const line of lines) {
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

    // Check if line contains any chord markers like [Bm], [Am], [C#]
    if (!/\[[A-G][^\]]{0,5}\]/.test(line)) {
      // Pure lyric line with no chord
      if (line.length > 0) {
        lyricLines.push({ chord: null, lyric: line })
      }
      continue
    }

    // Split line by chord markers
    // "[Bm]Aankhon Mein" splits into ["", "Bm", "Aankhon Mein"]
    const parts = line.split(/\[([A-G][^\]]{0,5})\]/)

    for (let i = 0; i < parts.length; i++) {
      // Odd indices are chord names (captured groups)
      if (i % 2 === 1) {
        const chord = parts[i].trim()
        const lyric = (parts[i + 1] || "").trim()

        if (chord) {
          chordsUsed.add(chord)
          lyricLines.push({ chord, lyric })
        }
      }
    }
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
      await page.close()
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

    await page.close()

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
    await page.close()
    throw err
  }
}

// ---- SAVE A SONG TO DATABASE ----

async function saveSong(
  data: NonNullable<Awaited<ReturnType<typeof parseSongPage>>>
) {
  // Upsert artists
  const artistRecords = await Promise.all(
    data.artists.map((name) =>
      prisma.artist.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name, slug: slugify(name) },
      })
    )
  )

  // Upsert chords
  const chordRecords = await Promise.all(
    data.chords.map((name) =>
      prisma.chord.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  )

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

  // Link artists to song
  await Promise.all(
    artistRecords.map((artist) =>
      prisma.songArtist.upsert({
        where: {
          songId_artistId: { songId: song.id, artistId: artist.id },
        },
        update: {},
        create: { songId: song.id, artistId: artist.id },
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
  const urls = allUrls.filter((u) => !done.has(u))

  console.log(`📋 Total URLs:     ${allUrls.length}`)
  console.log(`✅ Already done:   ${done.size}`)
  console.log(`⏳ Remaining:      ${urls.length}\n`)

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
      const data = await parseSongPage(browser, url)

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
      await new Promise((r) => setTimeout(r, 1000))
    } catch (err: any) {
      console.log(`❌ ${err.message?.split("\n")[0]}`)
      // Don't mark failed URLs as done — they'll be retried on next run
      failed++

      // Wait a bit longer after an error before continuing
      await new Promise((r) => setTimeout(r, 2000))

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