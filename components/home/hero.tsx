import Link from "next/link"

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center">

      {/* Background chord watermarks */}
      <span className="absolute top-10 left-10 text-[180px] font-bold text-white/[0.03] pointer-events-none select-none">Am</span>
      <span className="absolute top-20 right-20 text-[150px] font-bold text-white/[0.03] pointer-events-none select-none">G</span>
      <span className="absolute bottom-20 left-1/4 text-[200px] font-bold text-white/[0.03] pointer-events-none select-none">C</span>
      <span className="absolute bottom-10 right-10 text-[120px] font-bold text-white/[0.03] pointer-events-none select-none">Em</span>
      <span className="absolute top-1/2 right-1/4 text-[160px] font-bold text-white/[0.03] pointer-events-none select-none">Bm</span>
      <span className="absolute top-1/3 left-1/2 text-[140px] font-bold text-white/[0.03] pointer-events-none select-none">D</span>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 w-full">
        <div className="max-w-4xl">

          {/* Heading */}
          <h1 className="text-6xl font-bold leading-tight tracking-tight">
            Play songs you{" "}
            <span className="text-amber-500 italic">
              actually know
            </span>
          </h1>

          {/* Subtext */}
          <p className="mt-6 text-lg text-muted-foreground max-w-lg leading-relaxed">
            Select the chords you know &mdash; we&apos;ll instantly show you every song you can play right now.
          </p>

          {/* Buttons */}
          <div className="mt-8 flex items-center gap-4">
            <Link
              href="/songs"
              className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-xl transition-colors"
            >
              Browse Songs
            </Link>
            <a
              href="#how-it-works"
              className="border border-white/20 hover:border-white/40 text-white px-6 py-3 rounded-xl transition-colors"
            >
              How it works
            </a>
          </div>

          {/* Social proof */}
          <p className="mt-6 text-sm text-muted-foreground">
            2,500+ songs &middot; 100+ chords &middot; Free forever
          </p>

        </div>
      </div>

      {/* Bottom divider */}
      <div className="absolute bottom-0 w-full h-px bg-border" />

    </section>
  )
}