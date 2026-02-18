import { prisma } from "@/lib/prisma"
import { BrowseClient } from "@/app/api/songs/browse-client"

export default async function SongsPage() {
  // Fetch initial data on the server
  // This runs once when the page first loads
  const [songs, chords] = await Promise.all([
    prisma.song.findMany({
      take: 12, // first page only
      include: {
        artists: { include: { artist: true } },
        chords: { include: { chord: true } }
      },
      orderBy: { title: "asc" }
    }),
    prisma.chord.findMany({
      orderBy: { name: "asc" }
    })
  ])

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
      allChords={chords}
      total={songs.length}
    />
  )
}