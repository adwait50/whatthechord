import Link from "next/link"
import { ArrowRight } from "lucide-react"

// Hardcoded for now — we'll replace with real DB data later
const trendingSongs = [
  { title: "Tum Hi Ho", artist: "Arijit Singh", chords: ["Am", "C", "G", "Em"], difficulty: "Beginner", slug: "tum-hi-ho" },
  { title: "Kal Ho Naa Ho", artist: "Sonu Nigam", chords: ["G", "D", "Em", "C"], difficulty: "Intermediate", slug: "kal-ho-naa-ho" },
  { title: "Wonderwall", artist: "Oasis", chords: ["Em7", "G", "Dsus4", "A7"], difficulty: "Beginner", slug: "wonderwall" },
  { title: "Lag Ja Gale", artist: "Lata Mangeshkar", chords: ["Am", "F", "C", "G"], difficulty: "Beginner", slug: "lag-ja-gale" },
  { title: "Hotel California", artist: "Eagles", chords: ["Am", "E7", "G", "D"], difficulty: "Intermediate", slug: "hotel-california" },
]

const difficultyColor: Record<string, string> = {
  Beginner: "bg-green-500/20 text-green-400",
  Intermediate: "bg-amber-500/20 text-amber-400",
  Advanced: "bg-red-500/20 text-red-400",
}

export function TrendingSongs() {
  return (
    <section className="py-24 px-4 border-t border-border">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-500 text-xs font-semibold uppercase tracking-widest">
              Trending
            </p>
            <h2 className="mt-3 text-4xl font-bold">Popular right now</h2>
          </div>
          <Link
            href="/api/songs"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-amber-500 transition-colors"
          >
            View all library <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Cards - horizontal scroll on mobile, grid on desktop */}
        <div className="mt-10 flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {trendingSongs.map((song) => (
            <Link
              key={song.slug}
              href={`/api/songs/${song.slug}`}
              className="min-w-[240px] bg-card border border-border rounded-2xl p-5 hover:border-amber-500/50 transition-colors group flex-shrink-0"
            >
              {/* Difficulty badge */}
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${difficultyColor[song.difficulty]}`}>
                {song.difficulty}
              </span>

              {/* Song info */}
              <h3 className="mt-3 font-bold text-base">{song.title}</h3>
              <p className="text-muted-foreground text-sm mt-1">{song.artist}</p>

              {/* Chord pills */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {song.chords.map((chord) => (
                  <span
                    key={chord}
                    className="text-xs bg-background border border-border px-2 py-1 rounded"
                  >
                    {chord}
                  </span>
                ))}
              </div>

              {/* View link */}
              <p className="mt-4 text-xs text-amber-500 font-medium group-hover:underline">
                View Song →
              </p>
            </Link>
          ))}
        </div>

      </div>
    </section>
  )
}