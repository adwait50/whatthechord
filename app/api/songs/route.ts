import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const chordsParam = searchParams.get("chords")
  const chordNamesParam = searchParams.get("chordNames")
  const search = searchParams.get("search") || ""
  const decade = searchParams.get("decade") || ""
  const language = searchParams.get("language") || ""
  const artistName = searchParams.get("artist") || ""
  const sortBy = searchParams.get("sort") || "popular"
  const page = parseInt(searchParams.get("page") || "1")
  const pageSize = parseInt(searchParams.get("pageSize") || "24")
  const limit = isNaN(pageSize) || pageSize < 1 ? 24 : pageSize

  try {
    const where: any = {}

    // Search by title or artist name
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { artists: { some: { artist: { name: { contains: search, mode: "insensitive" } } } } },
      ]
    }

    // Decade filter
    if (decade) {
      where.decade = decade
    }

    // Language filter
    if (language) {
      where.language = { equals: language, mode: "insensitive" }
    }

    // Artist filter
    if (artistName) {
      where.artists = {
        some: {
          artist: {
            name: { equals: artistName, mode: "insensitive" },
          },
        },
      }
    }

    // Chord filter by names
    if (chordNamesParam) {
      const chordNames = chordNamesParam
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)

      if (chordNames.length > 0) {
        const matchedChords = await prisma.chord.findMany({
          where: { name: { in: chordNames } },
          select: { id: true },
        })

        const chordIds = matchedChords.map((item) => item.id)

        if (chordIds.length === 0) {
          return NextResponse.json({ songs: [], total: 0, page, totalPages: 0 })
        }

        where.AND = [
          ...(where.AND ?? []),
          ...chordIds.map((chordId) => ({
            chords: { some: { chordId } },
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
            chords: { some: { chordId } },
          })),
        ]
      }
    }

    const total = await prisma.song.count({ where })

    let songs: any[]

    if (sortBy === "popular") {
      // Prisma doesn't support orderBy relation count on findMany directly.
      // So: fetch all matching IDs, count saves via groupBy, sort, then paginate.
      const allMatchingIds = await prisma.song.findMany({
        where,
        select: { id: true },
      })

      const matchingIdList = allMatchingIds.map((s) => s.id)

      // Count how many times each song has been saved
      const saveCounts = await prisma.savedSong.groupBy({
        by: ["songId"],
        where: { songId: { in: matchingIdList } },
        _count: { songId: true },
        orderBy: { _count: { songId: "desc" } },
      })

      // Songs with saves first (sorted by count desc), then unsaved songs
      const savedIds = saveCounts.map((s) => s.songId)
      const savedIdSet = new Set(savedIds)
      const unsavedIds = matchingIdList.filter((id) => !savedIdSet.has(id))
      const orderedIds = [...savedIds, ...unsavedIds]

      // Paginate the ordered list
      const pageIds = orderedIds.slice((page - 1) * limit, page * limit)

      if (pageIds.length === 0) {
        songs = []
      } else {
        const rawSongs = await prisma.song.findMany({
          where: { id: { in: pageIds } },
          include: {
            artists: { include: { artist: true } },
            chords: { include: { chord: true } },
          },
        })
        // Re-apply the save-count order
        const songMap = new Map(rawSongs.map((s) => [s.id, s]))
        songs = pageIds.map((id) => songMap.get(id)).filter(Boolean)
      }
    } else {
      let orderBy: any
      switch (sortBy) {
        case "newest":     orderBy = { createdAt: "desc" }; break
        case "oldest":     orderBy = { createdAt: "asc" };  break
        case "title_asc":  orderBy = { title: "asc" };      break
        case "title_desc": orderBy = { title: "desc" };     break
        default:           orderBy = { createdAt: "desc" }
      }

      songs = await prisma.song.findMany({
        where,
        include: {
          artists: { include: { artist: true } },
          chords: { include: { chord: true } },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      })
    }

    const formatted = songs.map((song: any) => ({
      id: song.id,
      title: song.title,
      slug: song.slug,
      decade: song.decade,
      language: song.language,
      artists: song.artists.map((sa: any) => sa.artist.name),
      chords: song.chords.map((sc: any) => sc.chord.name),
    }))

    return NextResponse.json({
      songs: formatted,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error("Songs API error:", error)
    return NextResponse.json({ error: "Failed to fetch songs" }, { status: 500 })
  }
}