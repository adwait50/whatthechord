import { prisma } from "@/lib/prisma"
import { BrowseClient } from "@/components/songs/browse-client"

export default async function SongsPage() {
  const songs = await prisma.song.findMany({
    take: 12,
    include: {
      artists: { include: { artist: true } },
      chords: { include: { chord: true } }
    },
    orderBy: { title: "asc" }
  })

  // Format the data
  const formattedSongs = songs.map(song => ({
    id: song.id,
    title: song.title,
    slug: song.slug,
    decade: song.decade || "",
    language: song.language || "",
    artists: song.artists.map(sa => sa.artist.name),
    chords: song.chords.map(sc => sc.chord.name),
  }))

  // Pass data to client component
  return (
    <BrowseClient 
      initialSongs={formattedSongs} 
      total={songs.length}
    />
  )
}
