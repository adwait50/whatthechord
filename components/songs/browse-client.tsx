"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { SongCard } from "./song-card"
import { FiltersSidebar } from "./filters-sidebar"

type Song = {
  id: number
  title: string
  slug: string
  decade: string
  language: string
  artists: string[]
  chords: string[]
}

type Chord = {
  id: number
  name: string
}

type Props = {
  initialSongs: Song[]
  allChords: Chord[]
  total: number
}

export function BrowseClient({ initialSongs, allChords, total }: Props) {
  const [songs, setSongs] = useState(initialSongs)
  const [selectedChords, setSelectedChords] = useState<number[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)

  // Fetch filtered songs whenever filters change
  const fetchSongs = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    
    if (selectedChords.length > 0) {
      params.set("chords", selectedChords.join(","))
    }
    if (search) {
      params.set("search", search)
    }

    const res = await fetch(`/api/songs?${params}`)
    const data = await res.json()
    setSongs(data.songs)
    setLoading(false)
  }

  // Toggle chord selection
  const toggleChord = (chordId: number) => {
    setSelectedChords(prev => 
      prev.includes(chordId)
        ? prev.filter(id => id !== chordId)
        : [...prev, chordId]
    )
  }

  // Re-fetch when filters change
  const handleApplyFilters = () => {
    fetchSongs()
  }

  return (
    <div className="flex min-h-screen">
      
      {/* Sidebar */}
      <FiltersSidebar
        allChords={allChords}
        selectedChords={selectedChords}
        onToggleChord={toggleChord}
        onApplyFilters={handleApplyFilters}
      />

      {/* Main content */}
      <main className="flex-1 p-6">
        
        {/* Search bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search songs or artists..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
              className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading..." : `Showing ${songs.length} songs`}
            </p>
          </div>
        </div>

        {/* Song grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {songs.map(song => (
            <SongCard key={song.id} song={song} />
          ))}
        </div>

        {/* Empty state */}
        {songs.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No songs found. Try selecting different chords.
            </p>
          </div>
        )}

      </main>
    </div>
  )
}