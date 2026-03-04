import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

type SyncSource = "uberchord" | "generated" | "both"

type UberchordItem = {
  chordName?: unknown
  name?: unknown
}

const UBERCHORD_API_BASE_URL = "https://api.uberchord.com"
const REQUEST_TIMEOUT_MS = 12_000

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

function normalizeChordKey(chord: string): string {
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

function parseSourceArg(): SyncSource {
  const raw = process.argv.find((arg) => arg.startsWith("--source="))
  if (!raw) return "both"

  const value = raw.split("=")[1]?.trim().toLowerCase()
  if (value === "uberchord" || value === "generated" || value === "both") {
    return value
  }
  return "both"
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractUberchordNames(payload: unknown): string[] {
  if (!Array.isArray(payload)) return []

  const names: string[] = []
  for (const item of payload as UberchordItem[]) {
    const rawName =
      typeof item.chordName === "string"
        ? item.chordName
        : typeof item.name === "string"
          ? item.name
          : null

    if (!rawName) continue

    const display = toDisplayChordName(rawName)
    if (display) names.push(display)
  }

  return names
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

function buildUberchordQueryTerms(): string[] {
  const notes = ["A", "A#", "Bb", "B", "C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab"]
  const qualityHints = [
    "maj",
    "min",
    "m",
    "dim",
    "aug",
    "sus",
    "add",
    "6",
    "7",
    "9",
    "11",
    "13",
    "b5",
    "#5",
    "b9",
    "#9",
    "#11",
    "b13",
  ]

  const terms = new Set<string>()
  for (const note of notes) terms.add(note)
  for (const note of notes) {
    for (const hint of qualityHints) {
      terms.add(`${note}${hint}`)
    }
  }
  for (const hint of qualityHints) terms.add(hint)

  return Array.from(terms)
}

async function collectFromUberchord(): Promise<{ names: string[]; totalTerms: number; successTerms: number }> {
  const terms = buildUberchordQueryTerms()
  const namesByKey = new Map<string, string>()
  let successTerms = 0

  console.log(`- Uberchord discovery terms: ${terms.length}`)

  for (let i = 0; i < terms.length; i += 1) {
    const term = terms[i]
    const url = `${UBERCHORD_API_BASE_URL}/v1/chords?nameLike=${encodeURIComponent(term)}`

    try {
      const response = await fetchWithTimeout(url)
      if (!response.ok) {
        continue
      }

      const payload: unknown = await response.json()
      const names = extractUberchordNames(payload)
      if (names.length === 0) continue

      successTerms += 1
      for (const name of names) {
        const key = normalizeChordKey(name)
        if (!key) continue
        if (!namesByKey.has(key)) namesByKey.set(key, name)
      }
    } catch {
      // keep going; this source is opportunistic
    }

    if ((i + 1) % 25 === 0) {
      console.log(`  - processed ${i + 1}/${terms.length} terms`)
    }

    // Stay polite with external API.
    await sleep(75)
  }

  return {
    names: Array.from(namesByKey.values()),
    totalTerms: terms.length,
    successTerms,
  }
}

function buildGeneratedChordCatalog(includeSlash: boolean): string[] {
  const roots = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"]
  const slashBassRoots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

  const suffixes = [
    "",
    "m",
    "5",
    "6",
    "m6",
    "7",
    "maj7",
    "m7",
    "mMaj7",
    "dim",
    "dim7",
    "m7b5",
    "aug",
    "sus2",
    "sus4",
    "7sus4",
    "add9",
    "madd9",
    "add11",
    "add13",
    "6/9",
    "9",
    "maj9",
    "m9",
    "11",
    "m11",
    "13",
    "maj13",
    "m13",
    "7b5",
    "7#5",
    "7b9",
    "7#9",
    "7#11",
    "7b13",
    "9sus4",
    "7b9#11",
    "7#5#9",
    "7b5b9",
  ]

  const slashEligibleSuffixes = ["", "m", "7", "maj7", "m7", "sus4", "add9", "9", "11", "13"]

  const catalogByKey = new Map<string, string>()

  for (const root of roots) {
    for (const suffix of suffixes) {
      const chord = `${root}${suffix}`
      const key = normalizeChordKey(chord)
      if (key && !catalogByKey.has(key)) {
        catalogByKey.set(key, chord)
      }
    }
  }

  if (includeSlash) {
    for (const root of roots) {
      for (const suffix of slashEligibleSuffixes) {
        for (const bass of slashBassRoots) {
          if (normalizeChordKey(root) === normalizeChordKey(bass)) continue

          const chord = `${root}${suffix}/${bass}`
          const key = normalizeChordKey(chord)
          if (key && !catalogByKey.has(key)) {
            catalogByKey.set(key, chord)
          }
        }
      }
    }
  }

  return Array.from(catalogByKey.values())
}

function mergeChordLists(lists: string[][]): string[] {
  const byKey = new Map<string, string>()

  for (const list of lists) {
    for (const chord of list) {
      const trimmed = chord.trim()
      if (!trimmed) continue
      const key = normalizeChordKey(trimmed)
      if (!key) continue
      if (!byKey.has(key)) byKey.set(key, trimmed)
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b))
}

async function upsertChordCatalog(prisma: PrismaClient, chords: string[]): Promise<void> {
  const chunkSize = 500

  for (let i = 0; i < chords.length; i += chunkSize) {
    const chunk = chords.slice(i, i + chunkSize)
    await prisma.chord.createMany({
      data: chunk.map((name) => ({ name })),
      skipDuplicates: true,
    })
  }
}

async function main() {
  const source = parseSourceArg()
  const includeSlash = !hasFlag("--no-slash")
  const dryRun = hasFlag("--dry-run")

  const prisma = createPrismaClient()

  try {
    console.log("Building chord catalog...")
    console.log(`- source: ${source}`)
    console.log(`- include slash chords: ${includeSlash ? "yes" : "no"}`)
    console.log(`- dry run: ${dryRun ? "yes" : "no"}`)

    const collectedLists: string[][] = []

    if (source === "uberchord" || source === "both") {
      console.log("\nCollecting from Uberchord...")
      const result = await collectFromUberchord()
      console.log(`- Uberchord terms with results: ${result.successTerms}/${result.totalTerms}`)
      console.log(`- Uberchord unique chords: ${result.names.length}`)
      collectedLists.push(result.names)
    }

    if (source === "generated" || source === "both") {
      console.log("\nGenerating fallback catalog...")
      const generated = buildGeneratedChordCatalog(includeSlash)
      console.log(`- Generated chords: ${generated.length}`)
      collectedLists.push(generated)
    }

    if (collectedLists.length === 0) {
      console.log("Nothing to do. No sources selected.")
      return
    }

    const merged = mergeChordLists(collectedLists)
    console.log(`\nMerged unique chord names: ${merged.length}`)

    if (dryRun) {
      console.log("Dry run finished. No database changes were made.")
      return
    }

    console.log("Upserting chord catalog into database...")
    await upsertChordCatalog(prisma, merged)

    const finalCount = await prisma.chord.count()
    console.log(`Done. Chord table now contains ${finalCount} rows.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("Chord catalog sync failed:")
  console.error(error)
  process.exit(1)
})
