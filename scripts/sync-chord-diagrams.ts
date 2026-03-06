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

type ParsedChordForGeneration = {
  rootPc: number
  bassPc: number | null
  suffix: string
}

const UBERCHORD_API_BASE_URL = "https://api.uberchord.com"
const REQUEST_TIMEOUT_MS = 12_000
const FETCH_RETRIES = 3
const CHUNK_SIZE = 20
const OPEN_STRING_PITCH_CLASSES = [4, 9, 2, 7, 11, 4] // E A D G B E

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

function isBasicMajorMinorChordName(chordName: string): boolean {
  const normalized = normalizeChordName(chordName)
  if (!normalized || normalized.includes("/")) return false

  // After normalization, minor chords become trailing "M" (e.g. Am -> AM, C#m -> C#M).
  // This matcher intentionally keeps only bare major/minor triad names:
  // C, C#, Db, Dm, F#m, etc.
  return /^([A-G])(#|B)?(M)?$/.test(normalized)
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

const NOTE_TO_PC: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
}

function parseNotePc(note: string): number | null {
  const token = note.trim()
  if (!token) return null
  const normalized = token[0].toUpperCase() + (token.slice(1) || "")
  return NOTE_TO_PC[normalized] ?? null
}

function parseChordForGeneration(chordName: string): ParsedChordForGeneration | null {
  const compact = chordName
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")

  const [mainRaw, bassRaw = ""] = compact.split("/")
  const match = mainRaw.match(/^([A-Ga-g])([#b]?)(.*)$/)
  if (!match) return null

  const root = `${match[1].toUpperCase()}${match[2] || ""}`
  const rawSuffix = match[3] || ""
  const suffix = rawSuffix === "M" ? "m" : rawSuffix

  const rootPc = parseNotePc(root)
  if (rootPc === null) return null

  const bassPc = bassRaw ? parseNotePc(bassRaw) : null

  return {
    rootPc,
    bassPc,
    suffix,
  }
}

function ensureInterval(intervals: Set<number>, value: number) {
  intervals.add(((value % 12) + 12) % 12)
}

function replaceInterval(intervals: Set<number>, remove: number, add: number) {
  intervals.delete(((remove % 12) + 12) % 12)
  ensureInterval(intervals, add)
}

function buildChordIntervals(suffix: string): Set<number> {
  const lower = suffix.toLowerCase()
  const intervals = new Set<number>()

  const isSus2 = /sus2/.test(lower)
  const isSus4 = /sus4|sus(?!2)/.test(lower)
  const isDim = /dim/.test(lower) || /o/.test(lower)
  const isAug = /aug|\+/.test(lower)
  const isPower = /^5$/.test(lower)
  const isMinor = /^m(?!aj)/.test(lower) || /min/.test(lower)

  ensureInterval(intervals, 0)

  if (isPower) {
    ensureInterval(intervals, 7)
  } else if (isSus2) {
    ensureInterval(intervals, 2)
    ensureInterval(intervals, 7)
  } else if (isSus4) {
    ensureInterval(intervals, 5)
    ensureInterval(intervals, 7)
  } else if (isDim) {
    ensureInterval(intervals, 3)
    ensureInterval(intervals, 6)
  } else if (isAug) {
    ensureInterval(intervals, 4)
    ensureInterval(intervals, 8)
  } else if (isMinor) {
    ensureInterval(intervals, 3)
    ensureInterval(intervals, 7)
  } else {
    ensureInterval(intervals, 4)
    ensureInterval(intervals, 7)
  }

  if (/maj13/.test(lower)) {
    ensureInterval(intervals, 11)
    ensureInterval(intervals, 2)
    ensureInterval(intervals, 5)
    ensureInterval(intervals, 9)
  } else if (/m13/.test(lower)) {
    ensureInterval(intervals, 10)
    ensureInterval(intervals, 2)
    ensureInterval(intervals, 5)
    ensureInterval(intervals, 9)
  } else if (/13/.test(lower)) {
    ensureInterval(intervals, 10)
    ensureInterval(intervals, 2)
    ensureInterval(intervals, 5)
    ensureInterval(intervals, 9)
  } else if (/maj11/.test(lower)) {
    ensureInterval(intervals, 11)
    ensureInterval(intervals, 2)
    ensureInterval(intervals, 5)
  } else if (/m11/.test(lower)) {
    ensureInterval(intervals, 10)
    ensureInterval(intervals, 2)
    ensureInterval(intervals, 5)
  } else if (/11/.test(lower)) {
    ensureInterval(intervals, 10)
    ensureInterval(intervals, 2)
    ensureInterval(intervals, 5)
  } else if (/6\/9/.test(lower)) {
    ensureInterval(intervals, 9)
    ensureInterval(intervals, 2)
  } else if (/maj9/.test(lower)) {
    ensureInterval(intervals, 11)
    ensureInterval(intervals, 2)
  } else if (/m9/.test(lower)) {
    ensureInterval(intervals, 10)
    ensureInterval(intervals, 2)
  } else if (/9/.test(lower)) {
    ensureInterval(intervals, 10)
    ensureInterval(intervals, 2)
  }

  if (/mmaj7/.test(lower) || /m\(maj7\)/.test(lower)) {
    ensureInterval(intervals, 11)
    intervals.delete(10)
  } else if (/maj7/.test(lower)) {
    ensureInterval(intervals, 11)
    intervals.delete(10)
  } else if (/m7b5/.test(lower)) {
    ensureInterval(intervals, 10)
    replaceInterval(intervals, 7, 6)
  } else if (/dim7/.test(lower)) {
    ensureInterval(intervals, 9)
  } else if (/m7/.test(lower)) {
    ensureInterval(intervals, 10)
  } else if (/7/.test(lower)) {
    ensureInterval(intervals, 10)
  }

  if (/m6/.test(lower) || /(?<!m)6(?!\/9)/.test(lower)) {
    ensureInterval(intervals, 9)
  }

  for (const match of lower.matchAll(/add(2|4|6|9|11|13)/g)) {
    const token = match[1]
    if (token === "2" || token === "9") ensureInterval(intervals, 2)
    if (token === "4" || token === "11") ensureInterval(intervals, 5)
    if (token === "6" || token === "13") ensureInterval(intervals, 9)
  }

  if (/b5/.test(lower)) replaceInterval(intervals, 7, 6)
  if (/#5/.test(lower)) replaceInterval(intervals, 7, 8)
  if (/b9/.test(lower)) replaceInterval(intervals, 2, 1)
  if (/#9/.test(lower)) replaceInterval(intervals, 2, 3)
  if (/#11/.test(lower)) replaceInterval(intervals, 5, 6)
  if (/b13/.test(lower)) replaceInterval(intervals, 9, 8)

  return intervals
}

function candidateFretsForString(stringPc: number, chordPcs: Set<number>): number[] {
  const candidates: number[] = []
  for (let fret = 0; fret <= 5; fret += 1) {
    const pc = (stringPc + fret) % 12
    if (chordPcs.has(pc)) {
      candidates.push(fret)
    }
  }
  return candidates
}

function chooseFret(candidates: number[], preferPc: number | null, stringPc: number): number {
  if (candidates.length === 0) return -1

  if (preferPc !== null) {
    const preferred = candidates.filter((fret) => ((stringPc + fret) % 12) === preferPc)
    if (preferred.length > 0) {
      const nonZero = preferred.find((fret) => fret > 0)
      return nonZero ?? preferred[0]
    }
  }

  const nonZero = candidates.find((fret) => fret > 0)
  return nonZero ?? candidates[0]
}

function generateDotsForChord(chordName: string): ParsedDiagram | null {
  const parsed = parseChordForGeneration(chordName)
  if (!parsed) return null

  const intervals = buildChordIntervals(parsed.suffix)
  const chordPcs = new Set<number>()
  for (const interval of intervals) {
    chordPcs.add((parsed.rootPc + interval) % 12)
  }

  const candidatesByString = OPEN_STRING_PITCH_CLASSES.map((pc) => candidateFretsForString(pc, chordPcs))
  const selected = candidatesByString.map((candidates, index) =>
    chooseFret(candidates, index <= 1 ? parsed.rootPc : null, OPEN_STRING_PITCH_CLASSES[index])
  )

  if (parsed.bassPc !== null) {
    let bassAssigned = false
    for (let i = 0; i < OPEN_STRING_PITCH_CLASSES.length; i += 1) {
      const stringPc = OPEN_STRING_PITCH_CLASSES[i]
      const bassFret = chooseFret(candidatesByString[i], parsed.bassPc, stringPc)
      if (bassFret === -1) continue
      for (let j = 0; j < i; j += 1) {
        selected[j] = -1
      }
      selected[i] = bassFret
      bassAssigned = true
      break
    }
    if (!bassAssigned) {
      selected[0] = chooseFret(candidatesByString[0], parsed.rootPc, OPEN_STRING_PITCH_CLASSES[0])
    }
  }

  const hasRoot = selected.some((fret, index) => {
    if (fret < 0) return false
    return ((OPEN_STRING_PITCH_CLASSES[index] + fret) % 12) === parsed.rootPc
  })

  if (!hasRoot) {
    for (let i = 0; i < OPEN_STRING_PITCH_CLASSES.length; i += 1) {
      const replacement = chooseFret(candidatesByString[i], parsed.rootPc, OPEN_STRING_PITCH_CLASSES[i])
      if (replacement === -1) continue
      selected[i] = replacement
      break
    }
  }

  let dots: ChordDot[] = selected
    .map((fret, index) => ({ string: index + 1, fret }))
    .filter((item) => Number.isInteger(item.fret) && item.fret > 0 && item.fret <= 5)

  if (dots.length < 2) {
    for (let i = 0; i < OPEN_STRING_PITCH_CLASSES.length; i += 1) {
      if (selected[i] > 0) continue
      const extra = candidatesByString[i].find((fret) => fret > 0)
      if (!extra) continue
      selected[i] = extra
      dots = selected
        .map((fret, index) => ({ string: index + 1, fret }))
        .filter((item) => Number.isInteger(item.fret) && item.fret > 0 && item.fret <= 5)
      if (dots.length >= 2) break
    }
  }

  if (dots.length === 0) return null

  return {
    dots,
    rawChordName: chordName,
  }
}

async function main() {
  const dryRun = hasFlag("--dry-run")
  const exactFallback = hasFlag("--exact")
  const generatedFallback = !hasFlag("--no-generated")
  const basicMajorMinorOnly = hasFlag("--basic-major-minor") || hasFlag("--basic")
  const limit = parseLimitArg()

  const prisma = createPrismaClient()

  try {
    const allChords = await prisma.chord.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    })

    const basicOnlyChords = basicMajorMinorOnly
      ? allChords.filter((chord) => isBasicMajorMinorChordName(chord.name))
      : allChords
    const chords = limit > 0 ? basicOnlyChords.slice(0, limit) : basicOnlyChords

    console.log("Syncing chord diagrams...")
    console.log(`- total chords in DB: ${allChords.length}`)
    if (basicMajorMinorOnly) {
      console.log(`- basic major/minor in DB: ${basicOnlyChords.length}`)
    }
    console.log(`- target chords this run: ${chords.length}`)
    console.log(`- exact fallback: ${exactFallback ? "on" : "off"}`)
    console.log(`- generated fallback: ${generatedFallback ? "on" : "off"}`)
    console.log(`- basic major/minor only: ${basicMajorMinorOnly ? "yes" : "no"}`)
    console.log(`- dry run: ${dryRun ? "yes" : "no"}`)

    let stored = 0
    let missing = 0
    let exactHits = 0
    let generatedHits = 0
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

        if (!match && generatedFallback) {
          const generated = generateDotsForChord(item.inputName)
          if (generated) {
            match = generated
            source = "generated"
            generatedHits += 1
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
    if (generatedFallback) {
      console.log(`- generated fallback hits: ${generatedHits}`)
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
