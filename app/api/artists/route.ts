import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get("q") ?? "").trim()
  const limit = parseInt(searchParams.get("limit") || "50")

  try {
    if (query) {
      // Search mode — return artists matching query
      const artists = await prisma.artist.findMany({
        where: {
          name: { contains: query, mode: "insensitive" },
        },
        select: {
          id: true,
          name: true,
          _count: { select: { songs: true } },
        },
        orderBy: { songs: { _count: "desc" } },
        take: limit,
      })

      return NextResponse.json({
        artists: artists.map((a) => ({
          id: a.id,
          name: a.name,
          songCount: a._count.songs,
        })),
      })
    }

    // Default — top artists by song count
    const artists = await prisma.artist.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { songs: true } },
      },
      orderBy: { songs: { _count: "desc" } },
      take: limit,
    })

    return NextResponse.json({
      artists: artists.map((a) => ({
        id: a.id,
        name: a.name,
        songCount: a._count.songs,
      })),
    })
  } catch (error) {
    console.error("Artists API error:", error)
    return NextResponse.json({ error: "Failed to fetch artists" }, { status: 500 })
  }
}