import "dotenv/config"
import puppeteer from "puppeteer"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

type ScrapedChordData = {
  chartImageUrl: string | null
  chartImageUrls: string[]
  fullName: string | null
  notes: string[]
  intervals: string[]
}

const BASE_URL = "https://www.scales-chords.com"

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

function normalizeChordName(chord: string): string {
  return chord
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")
    .toUpperCase()
}

function normalizeChordForBasicFilter(chord: string): string {
  return chord
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function parseLimitArg(): number {
  const arg = process.argv.find((value) => value.startsWith("--limit="))
  if (!arg) return 0
  const parsed = Number(arg.split("=")[1])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function parseUserDataDirArg(): string {
  const arg = process.argv.find((value) => value.startsWith("--user-data-dir="))
  if (!arg) return ".cache/scales-chords-profile"
  const value = arg.split("=")[1]?.trim()
  return value ? value : ".cache/scales-chords-profile"
}

function parseDelayArg(): number {
  const arg = process.argv.find((value) => value.startsWith("--delay-ms="))
  if (!arg) return 900
  const parsed = Number(arg.split("=")[1])
  if (!Number.isFinite(parsed) || parsed < 0) return 900
  return Math.floor(parsed)
}

function isBasicMajorMinorChordName(chordName: string): boolean {
  const compact = normalizeChordForBasicFilter(chordName)
  if (!compact || compact.includes("/")) return false
  return /^[A-G](#|b)?m?$/i.test(compact)
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForCloudflareToClear(page: puppeteer.Page, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const title = await page.title()
    if (!/just a moment/i.test(title)) return true
    await sleep(1000)
  }
  return false
}

async function scrapeChordPage(page: puppeteer.Page, chordName: string): Promise<ScrapedChordData | null> {
  const url = `${BASE_URL}/chord/guitar/${encodeURIComponent(chordName)}`
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 })

  const cloudflareCleared = await waitForCloudflareToClear(page, 120_000)
  if (!cloudflareCleared) {
    return null
  }

  await page.waitForSelector("body", { timeout: 20_000 })
  await sleep(1000)

  const data = await page.evaluate(() => {
    const allImageUrls = Array.from(
      new Set(
        Array.from(document.querySelectorAll<HTMLImageElement>('img[src*="/generated/chord-charts/"]'))
          .map((imageEl) => imageEl.getAttribute("src") ?? "")
          .filter(Boolean)
          .map((src) => new URL(src, window.location.origin).href)
      )
    )
    const chartImageUrl = allImageUrls[0] ?? null

    const fullNameEl = document.querySelector("h1")
    const fullName = fullNameEl?.textContent?.trim() || null

    const rows = Array.from(document.querySelectorAll("table tr"))
    let notes: string[] = []
    let intervals: string[] = []

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("th,td"))
        .map((cell) => (cell.textContent || "").trim())
        .filter(Boolean)
      if (cells.length < 2) continue

      const label = cells[0].toLowerCase()
      if (label === "notes") notes = cells.slice(1)
      if (label === "intervals") intervals = cells.slice(1)
    }

    return {
      chartImageUrl,
      chartImageUrls: allImageUrls,
      fullName,
      notes,
      intervals,
    }
  })

  return data
}

function hasStoredChartImage(dots: unknown): boolean {
  if (!dots || typeof dots !== "object") return false
  const value = dots as Record<string, unknown>
  if (typeof value.chartImageUrl === "string" && value.chartImageUrl.trim().length > 0) {
    return true
  }
  if (Array.isArray(value.chartImageUrls)) {
    return value.chartImageUrls.some((item) => typeof item === "string" && item.trim().length > 0)
  }
  return false
}

async function main() {
  const prisma = createPrismaClient()
  const limit = parseLimitArg()
  const basicOnly = hasFlag("--basic-major-minor")
  const headless = hasFlag("--headless")
  const userDataDir = parseUserDataDirArg()
  const refresh = hasFlag("--refresh")
  const delayMs = parseDelayArg()

  try {
    const allChords = await prisma.chord.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    })

    const filtered = basicOnly ? allChords.filter((chord) => isBasicMajorMinorChordName(chord.name)) : allChords

    const existingDiagrams = await prisma.chordDiagram.findMany({
      where: {
        source: "scales-chords",
        chordId: { in: filtered.map((item) => item.id) },
      },
      select: {
        chordId: true,
        dots: true,
      },
    })

    const alreadyStoredIds = new Set(
      existingDiagrams.filter((entry) => hasStoredChartImage(entry.dots)).map((entry) => entry.chordId)
    )

    const pending = refresh ? filtered : filtered.filter((item) => !alreadyStoredIds.has(item.id))
    const target = limit > 0 ? pending.slice(0, limit) : pending

    console.log("Scraping Scales-Chords chord diagrams...")
    console.log(`- total chords in DB: ${allChords.length}`)
    console.log(`- candidate chords: ${filtered.length}`)
    console.log(`- already stored (scales-chords): ${alreadyStoredIds.size}`)
    console.log(`- target chords this run: ${target.length}`)
    console.log(`- basic major/minor only: ${basicOnly ? "yes" : "no"}`)
    console.log(`- refresh existing: ${refresh ? "yes" : "no"}`)
    console.log(`- headless: ${headless ? "yes" : "no"}`)
    console.log(`- delay per chord: ${delayMs}ms`)
    console.log(`- user data dir: ${userDataDir}`)
    console.log("")
    console.log("If Cloudflare challenge appears, solve it once in the opened browser window.")

    const browser = await puppeteer.launch({
      headless,
      userDataDir,
      defaultViewport: { width: 1365, height: 900 },
    })

    try {
      const page = await browser.newPage()
      let stored = 0
      let failed = 0
      const failedChords: string[] = []

      for (let i = 0; i < target.length; i += 1) {
        const item = target[i]
        const progress = `[${i + 1}/${target.length}]`
        process.stdout.write(`${progress} ${item.name} ... `)

        try {
          const scraped = await scrapeChordPage(page, item.name)
          if (!scraped || !scraped.chartImageUrl) {
            failed += 1
            failedChords.push(item.name)
            console.log("no chart found")
            continue
          }

          const normalizedName = normalizeChordName(item.name)
          const chartUrls =
            scraped.chartImageUrls.length > 0
              ? scraped.chartImageUrls
              : scraped.chartImageUrl
                ? [scraped.chartImageUrl]
                : []

          await prisma.chordDiagram.upsert({
            where: { chordId: item.id },
            update: {
              normalizedName,
              dots: {
                provider: "scales-chords",
                chartImageUrl: scraped.chartImageUrl,
                chartImageUrls: chartUrls,
                fullName: scraped.fullName,
                notes: scraped.notes,
                intervals: scraped.intervals,
                scrapedAt: new Date().toISOString(),
              },
              rawChordName: item.name,
              source: "scales-chords",
            },
            create: {
              chordId: item.id,
              normalizedName,
              dots: {
                provider: "scales-chords",
                chartImageUrl: scraped.chartImageUrl,
                chartImageUrls: chartUrls,
                fullName: scraped.fullName,
                notes: scraped.notes,
                intervals: scraped.intervals,
                scrapedAt: new Date().toISOString(),
              },
              rawChordName: item.name,
              source: "scales-chords",
            },
          })

          stored += 1
          console.log(`stored (${chartUrls.length} chart url${chartUrls.length === 1 ? "" : "s"})`)
        } catch (error) {
          failed += 1
          failedChords.push(item.name)
          const reason = error instanceof Error ? error.message : "unknown error"
          console.log(`failed (${reason})`)
        }

        await sleep(delayMs)
      }

      console.log("")
      console.log("Done.")
      console.log(`- stored: ${stored}`)
      console.log(`- failed: ${failed}`)
      if (failedChords.length > 0) {
        console.log(`- failed sample: ${failedChords.slice(0, 20).join(", ")}`)
      }
    } finally {
      await browser.close()
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("Scales-Chords scraping failed:")
  console.error(error)
  process.exit(1)
})
