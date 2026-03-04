import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  
  
  const chordsParam = searchParams.get("chords")
  const chordNamesParam = searchParams.get("chordNames")
  const search = searchParams.get("search") || ""      
  const decade = searchParams.get("decade") || ""      
  const page = parseInt(searchParams.get("page") || "1")
  const limit = 12 

  try {
    
    const where: any = {}

    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { artists: { some: { artist: { name: { contains: search, mode: "insensitive" } } } } }
      ]
    }

    
    if (decade) {
      where.decade = decade
    }

    
    
    
    if (chordNamesParam) {
      const chordNames = chordNamesParam
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)

      if (chordNames.length > 0) {
        const matchedChords = await prisma.chord.findMany({
          where: {
            name: { in: chordNames },
          },
          select: { id: true },
        })

        const chordIds = matchedChords.map((item) => item.id)

        if (chordIds.length === 0) {
          return NextResponse.json({
            songs: [],
            total: 0,
            page,
            totalPages: 0,
          })
        }

        where.AND = [
          ...(where.AND ?? []),
          ...chordIds.map((chordId) => ({
            chords: {
              some: {
                chordId,
              },
            },
          })),
        ]
      }
    } else if (chordsParam) {
      const chordIds = chordsParam
        .split(",")
        .map(Number)
        .filter((id) => Number.isInteger(id))

      if (chordIds.length > 0) {
        where.AND = [
          ...(where.AND ?? []),
          ...chordIds.map((chordId) => ({
            chords: {
              some: {
                chordId,
              },
            },
          })),
        ]
      }
    }

    
    const [songs, total] = await Promise.all([
      prisma.song.findMany({
        where,
        include: {
          artists: { include: { artist: true } },
          chords: { include: { chord: true } }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" }
      }),
      prisma.song.count({ where })
    ])

    
    const formatted = songs.map(song => ({
      id: song.id,
      title: song.title,
      slug: song.slug,
      decade: song.decade,
      language: song.language,
      artists: song.artists.map(sa => sa.artist.name),
      chords: song.chords.map(sc => sc.chord.name),
    }))

    return NextResponse.json({
      songs: formatted,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    })

  } catch (error) {
    console.error("Songs API error:", error)
    return NextResponse.json(
      { error: "Failed to fetch songs" },
      { status: 500 }
    )
  }
}
