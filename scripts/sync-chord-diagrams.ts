import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

type ChordDot = {
  string: number
  fret: number
}

type UberchordChord = {
  chordName?: unknown
  strings?: unknown
  fingering?: unknown
}

type ParsedDiagram = {
  dots: ChordDot[]
  rawChordName: string
}

const UBERCHORD_API_BASE_URL = "https://api.uberchord.com"
const REQUEST_TIMEOUT_MS = 12_000
const FETCH_RETRIES = 3
const CHUNK_SIZE = 20

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

function toDisplayChordName(raw: string): string {
  const value = raw.trim()
  if (!value) return ""

  if (value.includes(",")) {
    const [rawRoot = "", rawQuality = "", rawTension = "", rawBass = ""] = value.split(",")
    const root = rawRoot.trim()
    const quality = rawQuality.trim()
    const tension = rawTension.trim()
    const bass = rawBass.trim()
    const base = `${root}${quality}${tension}`
    return bass ? `${base}/${bass}` : base
  }

  return value
    .replace(/_sharp/gi, "#")
    .replace(/_flat/gi, "b")
    .replace(/_major/gi, "maj")
    .replace(/_minor/gi, "m")
    .replace(/_maj/gi, "maj")
    .replace(/_min/gi, "m")
    .replace(/_/g, "")
    .replace(/\s+/g, "")
}

function toApiChordName(chord: string): string {
  const cleaned = chord
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")

  if (cleaned.includes(",")) return cleaned

  const [baseChord, bassPart = ""] = cleaned.split("/")
  const bass = bassPart.trim()

  const match = baseChord.match(/^([a-gA-G])([#b]?)(.*)$/)
  if (!match) return cleaned

  const [, rootLetter, accidental, rawSuffix] = match
  const root = `${rootLetter.toUpperCase()}${accidental}`
  let suffix = rawSuffix

  // Legacy scraped data often stores minor as trailing "M" (e.g. F#M).
  if (suffix === "M") suffix = "m"

  if (!suffix) {
    return bass ? `${root},,,${bass}` : root
  }

  let quality = ""
  let tension = suffix

  if (/^maj/i.test(suffix)) {
    quality = "maj"
    tension = suffix.slice(3)
  } else if (/^m(?!aj)/i.test(suffix)) {
    quality = "m"
    tension = suffix.slice(1)
  } else if (/^dim/i.test(suffix)) {
    quality = "dim"
    tension = suffix.slice(3)
  } else if (/^aug/i.test(suffix)) {
    quality = "aug"
    tension = suffix.slice(3)
  }

  if (bass) {
    return `${root},${quality},${tension},${bass}`
  }

  return `${root}_${quality}${tension}`
}

function parseStringsToken(raw: string): string[] {
  const compact = raw.replace(/\s+/g, "")
  if (compact.length === 6) return compact.split("")
  const bySpace = raw.trim().split(/\s+/)
  if (bySpace.length === 6) return bySpace
  return []
}

function toDotsFromFrets(tokens: string[]): ChordDot[] {
  const dots: ChordDot[] = []
  tokens.forEach((token, index) => {
    if (!/^\d+$/.test(token)) return
    const fret = Number(token)
    if (!Number.isInteger(fret) || fret <= 0) return
    if (fret > 5) return
    dots.push({ string: index + 1, fret })
  })
  return dots
}

function parseUberchordPayload(payload: unknown): Record<string, ParsedDiagram> {
  if (!Array.isArray(payload)) return {}

  const map: Record<string, ParsedDiagram> = {}
  for (const item of payload as UberchordChord[]) {
    const rawName = typeof item.chordName === "string" ? item.chordName : null
    const rawStrings =
      typeof item.strings === "string"
        ? item.strings
        : typeof item.fingering === "string"
          ? item.fingering
          : null

    if (!rawName || !rawStrings) continue
    const tokens = parseStringsToken(rawStrings)
    if (tokens.length !== 6) continue

    const dots = toDotsFromFrets(tokens)
    if (dots.length === 0) continue

    const displayName = toDisplayChordName(rawName)
    const normalizedName = normalizeChordName(displayName)
    if (!normalizedName) continue

    if (!map[normalizedName]) {
      map[normalizedName] = {
        dots,
        rawChordName: rawName,
      }
    }
  }

  return map
}

function parseLimitArg(): number {
  const arg = process.argv.find((value) => value.startsWith("--limit="))
  if (!arg) return 0
  const parsed = Number(arg.split("=")[1])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJsonWithRetry(url: string): Promise<unknown> {
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })

      if (!response.ok) {
        if (attempt === FETCH_RETRIES) return null
        await sleep(250 * attempt)
        continue
      }

      return (await response.json()) as unknown
    } catch {
      if (attempt === FETCH_RETRIES) return null
      await sleep(250 * attempt)
    } finally {
      clearTimeout(timeout)
    }
  }

  return null
}

async function fetchByNames(apiChordNames: string[]): Promise<Record<string, ParsedDiagram>> {
  if (apiChordNames.length === 0) return {}
  const url = `${UBERCHORD_API_BASE_URL}/v1/chords?names=${encodeURIComponent(apiChordNames.join(","))}`
  const payload = await fetchJsonWithRetry(url)
  return parseUberchordPayload(payload)
}

async function fetchExact(apiChordName: string): Promise<Record<string, ParsedDiagram>> {
  const url = `${UBERCHORD_API_BASE_URL}/v1/chords/${encodeURIComponent(apiChordName)}`
  const payload = await fetchJsonWithRetry(url)
  return parseUberchordPayload(payload)
}

async function main() {
  const dryRun = hasFlag("--dry-run")
  const exactFallback = hasFlag("--exact")
  const limit = parseLimitArg()

  const prisma = createPrismaClient()

  try {
    const allChords = await prisma.chord.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    })

    const chords = limit > 0 ? allChords.slice(0, limit) : allChords

    console.log("Syncing chord diagrams...")
    console.log(`- total chords in DB: ${allChords.length}`)
    console.log(`- target chords this run: ${chords.length}`)
    console.log(`- exact fallback: ${exactFallback ? "on" : "off"}`)
    console.log(`- dry run: ${dryRun ? "yes" : "no"}`)

    let stored = 0
    let missing = 0
    let exactHits = 0
    const missingNames: string[] = []

    for (let offset = 0; offset < chords.length; offset += CHUNK_SIZE) {
      const chunk = chords.slice(offset, offset + CHUNK_SIZE)
      const requestItems = chunk.map((chord) => ({
        chordId: chord.id,
        inputName: chord.name,
        normalizedInput: normalizeChordName(chord.name),
        apiName: toApiChordName(chord.name),
      }))

      const bulkMap = await fetchByNames(requestItems.map((item) => item.apiName))

      for (const item of requestItems) {
        let match = bulkMap[item.normalizedInput]
        let source = "uberchord-bulk"

        if (!match && exactFallback) {
          const exactMap = await fetchExact(item.apiName)
          const exact = exactMap[item.normalizedInput]
          if (exact) {
            match = exact
            source = "uberchord-exact"
            exactHits += 1
          }
        }

        if (!match) {
          missing += 1
          missingNames.push(item.inputName)
          continue
        }

        if (!dryRun) {
          await prisma.chordDiagram.upsert({
            where: { chordId: item.chordId },
            update: {
              normalizedName: item.normalizedInput,
              dots: match.dots,
              rawChordName: match.rawChordName,
              source,
            },
            create: {
              chordId: item.chordId,
              normalizedName: item.normalizedInput,
              dots: match.dots,
              rawChordName: match.rawChordName,
              source,
            },
          })
        }

        stored += 1
      }

      const processed = Math.min(offset + CHUNK_SIZE, chords.length)
      if (processed % 200 === 0 || processed === chords.length) {
        console.log(`  - processed ${processed}/${chords.length}`)
      }
      await sleep(90)
    }

    console.log("Done.")
    console.log(`- stored diagrams: ${stored}`)
    console.log(`- missing diagrams: ${missing}`)
    if (exactFallback) {
      console.log(`- exact fallback hits: ${exactHits}`)
    }

    if (missingNames.length > 0) {
      console.log(`- missing sample: ${missingNames.slice(0, 20).join(", ")}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("Chord diagram sync failed:")
  console.error(error)
  process.exit(1)
})
