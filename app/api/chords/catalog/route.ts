import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function deriveChordInfo(chordName: string): { type: string; root: string; isSlash: boolean } {
  const compact = chordName
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")

  const [main, bass = ""] = compact.split("/")
  const match = main.match(/^([A-G])([#b]?)(.*)$/i)
  if (!match) {
    return {
      type: "other",
      root: "other",
      isSlash: bass.length > 0,
    }
  }

  const root = `${match[1].toUpperCase()}${match[2] || ""}`
  const suffix = (match[3] || "").trim().toLowerCase()
  let type = suffix

  if (!suffix) type = "major"
  if (suffix === "m") type = "minor"

  return {
    type,
    root,
    isSlash: bass.length > 0,
  }
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim()

  try {
    const chords = await prisma.chord.findMany({
      where: query
        ? {
            name: {
              contains: query,
              mode: "insensitive",
            },
          }
        : undefined,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    })

    const payload = chords.map((chord) => ({
      ...deriveChordInfo(chord.name),
      id: chord.id,
      name: chord.name,
    }))

    return NextResponse.json({
      chords: payload,
      source: "local-db" as const,
    })
  } catch {
    try {
      const fallbackChords = await prisma.chord.findMany({
        where: query
          ? {
              name: {
                contains: query,
                mode: "insensitive",
              },
            }
          : undefined,
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })

      return NextResponse.json({
        chords: fallbackChords.map((chord) => ({
          ...deriveChordInfo(chord.name),
          id: chord.id,
          name: chord.name,
        })),
        source: "local-db" as const,
        error: "Showing local chords.",
      })
    } catch {
      return NextResponse.json(
        {
          chords: [],
          source: "local-db" as const,
          error: "Failed to load chord catalog from database.",
        },
        { status: 500 }
      )
    }
  }
}
