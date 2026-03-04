import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

type ChordDot = {
  string: number
  fret: number
}

function normalizeChordName(chord: string): string {
  return chord
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")
    .toUpperCase()
}

function parseDots(value: unknown): ChordDot[] {
  if (!Array.isArray(value)) return []

  const dots: ChordDot[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const maybe = item as { string?: unknown; fret?: unknown }
    const stringNum = Number(maybe.string)
    const fretNum = Number(maybe.fret)
    if (!Number.isInteger(stringNum) || !Number.isInteger(fretNum)) continue
    if (stringNum < 1 || stringNum > 6) continue
    if (fretNum < 1 || fretNum > 5) continue
    dots.push({ string: stringNum, fret: fretNum })
  }

  return dots
}

export async function GET(request: NextRequest) {
  const namesParam = request.nextUrl.searchParams.get("names")
  if (!namesParam) {
    return NextResponse.json({ diagrams: {} as Record<string, ChordDot[]> })
  }

  const names = namesParam
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 20)

  const normalizedInputs = Array.from(new Set(names.map((name) => normalizeChordName(name))))

  try {
    const rows = await prisma.chordDiagram.findMany({
      where: {
        normalizedName: {
          in: normalizedInputs,
        },
      },
      select: {
        normalizedName: true,
        dots: true,
      },
    })

    const diagrams: Record<string, ChordDot[]> = {}
    for (const row of rows) {
      if (diagrams[row.normalizedName]) continue
      const dots = parseDots(row.dots)
      if (dots.length === 0) continue
      diagrams[row.normalizedName] = dots
    }

    return NextResponse.json({ diagrams })
  } catch {
    return NextResponse.json({ diagrams: {} as Record<string, ChordDot[]> })
  }
}
