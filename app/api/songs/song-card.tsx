import Link from "next/link"

type Song = {
  id: number
  title: string
  slug: string
  artists: string[]
  chords: string[]
}

export function SongCard({ song }: { song: Song }) {
  return (
    <Link
      href={`/api/songs/${song.slug}`}
      className="block bg-card border border-border rounded-xl p-5 hover:border-amber-500/50 transition-colors group"
    >
      <h3 className="font-bold text-base">{song.title}</h3>
      <p className="text-sm text-muted-foreground mt-1">
        {song.artists.join(", ")}
      </p>

      <div className="mt-4 flex flex-wrap gap-1">
        {song.chords.slice(0, 6).map(chord => (
          <span
            key={chord}
            className="text-xs bg-background border border-border px-2 py-1 rounded"
          >
            {chord}
          </span>
        ))}
        {song.chords.length > 6 && (
          <span className="text-xs text-muted-foreground">
            +{song.chords.length - 6}
          </span>
        )}
      </div>

      <p className="mt-4 text-xs text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
        View Song →
      </p>
    </Link>
  )
}