import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

type ChordCategory = "BASIC" | "MINOR" | "SEVENTH" | "EXTENDED" | "ALTERED" | "SLASH" | "OTHER"

type ParsedMetadata = {
  normalizedName: string
  root: string
  quality: string
  extension: string | null
  bassNote: string | null
  alterations: string[]
  addTones: string[]
  suspensions: string[]
  isSlash: boolean
  isBasic: boolean
  isAltered: boolean
  category: ChordCategory
}

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function normalizeChordKey(chord: string): string {
  return chord
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")
    .toUpperCase()
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function detectQuality(suffix: string): string {
  if (!suffix) return "MAJOR"
  if (/^m(?!aj)/i.test(suffix)) return "MINOR"
  if (/maj/i.test(suffix)) return "MAJOR"
  if (/dim/i.test(suffix)) return "DIMINISHED"
  if (/aug/i.test(suffix)) return "AUGMENTED"
  if (/sus/i.test(suffix)) return "SUSPENDED"
  if (/^5$/.test(suffix)) return "POWER"
  if (/7/.test(suffix)) return "DOMINANT"
  return "OTHER"
}

function detectExtension(suffix: string): string | null {
  const order = ["maj13", "m13", "13", "maj11", "m11", "11", "6/9", "maj9", "m9", "9", "maj7", "m7", "7", "6"]
  const lower = suffix.toLowerCase()

  for (const candidate of order) {
    if (lower.includes(candidate)) return candidate
  }

  return null
}

function parseChordMetadata(chordName: string): ParsedMetadata {
  const compact = chordName
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")

  const [mainRaw, bassRaw = ""] = compact.split("/")
  const bassNote = bassRaw.trim() || null
  const main = mainRaw.trim()

  const mainMatch = main.match(/^([A-G])([#b]?)(.*)$/)
  const root = mainMatch ? `${mainMatch[1]}${mainMatch[2]}` : "UNKNOWN"
  const suffix = mainMatch ? (mainMatch[3] || "") : main

  const quality = detectQuality(suffix)
  const extension = detectExtension(suffix)

  const alterations = unique(
    Array.from(suffix.matchAll(/(?:b|#)(?:5|9|11|13)/gi)).map((m) => (m[0] || "").toLowerCase())
  )
  const addTones = unique(
    Array.from(suffix.matchAll(/add(2|4|6|9|11|13)/gi)).map((m) => (m[1] || "").toLowerCase())
  )
  const suspensions = unique(
    Array.from(suffix.matchAll(/sus(2|4)?/gi)).map((m) => (m[0] || "").toLowerCase())
  )

  const isSlash = Boolean(bassNote)
  const isAltered = alterations.length > 0
  const isBasic =
    !isSlash &&
    !isAltered &&
    addTones.length === 0 &&
    suspensions.length === 0 &&
    (extension === null || extension === "7") &&
    (quality === "MAJOR" || quality === "MINOR" || quality === "POWER")

  let category: ChordCategory = "OTHER"
  const extendedSet = new Set(["9", "11", "13", "maj9", "m9", "maj11", "m11", "maj13", "m13", "6/9"])
  const seventhSet = new Set(["7", "maj7", "m7", "6"])

  if (isSlash) {
    category = "SLASH"
  } else if (isAltered) {
    category = "ALTERED"
  } else if ((extension && extendedSet.has(extension)) || addTones.length > 0) {
    category = "EXTENDED"
  } else if (extension && seventhSet.has(extension)) {
    category = "SEVENTH"
  } else if (quality === "MINOR") {
    category = "MINOR"
  } else if (isBasic) {
    category = "BASIC"
  }

  return {
    normalizedName: normalizeChordKey(compact),
    root,
    quality,
    extension,
    bassNote,
    alterations,
    addTones,
    suspensions,
    isSlash,
    isBasic,
    isAltered,
    category,
  }
}

async function main() {
  const dryRun = hasFlag("--dry-run")
  const prisma = createPrismaClient()

  try {
    console.log("Syncing chord metadata...")
    console.log(`- dry run: ${dryRun ? "yes" : "no"}`)

    const chords = await prisma.chord.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    })

    console.log(`- source chords: ${chords.length}`)

    if (dryRun) {
      const preview = chords.slice(0, 12).map((chord) => ({
        id: chord.id,
        name: chord.name,
        parsed: parseChordMetadata(chord.name),
      }))
      console.log(JSON.stringify(preview, null, 2))
      return
    }

    const chunkSize = 120
    for (let i = 0; i < chords.length; i += chunkSize) {
      const chunk = chords.slice(i, i + chunkSize)

      await Promise.all(
        chunk.map((chord) => {
          const parsed = parseChordMetadata(chord.name)
          return prisma.chordMetadata.upsert({
            where: { chordId: chord.id },
            update: {
              normalizedName: parsed.normalizedName,
              root: parsed.root,
              quality: parsed.quality,
              extension: parsed.extension,
              bassNote: parsed.bassNote,
              alterations: parsed.alterations,
              addTones: parsed.addTones,
              suspensions: parsed.suspensions,
              isSlash: parsed.isSlash,
              isBasic: parsed.isBasic,
              isAltered: parsed.isAltered,
              category: parsed.category,
            },
            create: {
              chordId: chord.id,
              normalizedName: parsed.normalizedName,
              root: parsed.root,
              quality: parsed.quality,
              extension: parsed.extension,
              bassNote: parsed.bassNote,
              alterations: parsed.alterations,
              addTones: parsed.addTones,
              suspensions: parsed.suspensions,
              isSlash: parsed.isSlash,
              isBasic: parsed.isBasic,
              isAltered: parsed.isAltered,
              category: parsed.category,
            },
          })
        })
      )

      const processed = Math.min(i + chunkSize, chords.length)
      if (processed % 600 === 0 || processed === chords.length) {
        console.log(`  - processed ${processed}/${chords.length}`)
      }
    }

    const summary = await prisma.chordMetadata.groupBy({
      by: ["category"],
      _count: { _all: true },
      orderBy: { category: "asc" },
    })

    console.log("Done. Category distribution:")
    for (const row of summary) {
      console.log(`- ${row.category}: ${row._count._all}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("Chord metadata sync failed:")
  console.error(error)
  process.exit(1)
})
