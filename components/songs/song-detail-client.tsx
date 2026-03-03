"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Heart, Play, Share2 } from "lucide-react"

import type { SongDetailViewModel } from "./song-detail-types"

type ChordDot = {
  string: number
  fret: number
}

const CHORD_SHAPES: Record<string, ChordDot[]> = {
  AM: [
    { string: 3, fret: 2 },
    { string: 4, fret: 2 },
    { string: 5, fret: 1 },
  ],
  A: [
    { string: 3, fret: 2 },
    { string: 4, fret: 2 },
    { string: 5, fret: 2 },
  ],
  C: [
    { string: 2, fret: 3 },
    { string: 3, fret: 2 },
    { string: 5, fret: 1 },
  ],
  D: [
    { string: 4, fret: 2 },
    { string: 5, fret: 3 },
    { string: 6, fret: 2 },
  ],
  DM: [
    { string: 4, fret: 2 },
    { string: 5, fret: 3 },
    { string: 6, fret: 1 },
  ],
  E: [
    { string: 2, fret: 2 },
    { string: 3, fret: 2 },
    { string: 4, fret: 1 },
  ],
  EM: [
    { string: 2, fret: 2 },
    { string: 3, fret: 2 },
  ],
  F: [
    { string: 1, fret: 1 },
    { string: 2, fret: 3 },
    { string: 3, fret: 3 },
    { string: 4, fret: 2 },
    { string: 5, fret: 1 },
    { string: 6, fret: 1 },
  ],
  G: [
    { string: 1, fret: 3 },
    { string: 2, fret: 2 },
    { string: 6, fret: 3 },
  ],
  BM: [
    { string: 2, fret: 2 },
    { string: 3, fret: 4 },
    { string: 4, fret: 4 },
    { string: 5, fret: 3 },
    { string: 6, fret: 2 },
  ],
  B7: [
    { string: 2, fret: 2 },
    { string: 3, fret: 1 },
    { string: 4, fret: 2 },
    { string: 6, fret: 2 },
  ],
  "A#": [
    { string: 2, fret: 1 },
    { string: 3, fret: 3 },
    { string: 4, fret: 3 },
    { string: 5, fret: 3 },
    { string: 6, fret: 1 },
  ],
  BB: [
    { string: 2, fret: 1 },
    { string: 3, fret: 3 },
    { string: 4, fret: 3 },
    { string: 5, fret: 3 },
    { string: 6, fret: 1 },
  ],
}

function normalizeChordName(chord: string): string {
  return chord
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")
    .toUpperCase()
}

// transpose helper: shift a chord name by a number of semitones (steps can be negative)
function transposeChord(chord: string, steps: number): string {
  if (steps === 0) return chord

  const normalized = normalizeChordName(chord)
  const match = normalized.match(/^([A-G][#B]?)(.*)$/)
  if (!match) {
    return chord
  }

  let [, root, rest] = match
  // convert flats ("B" suffix after root) to their sharp equivalents
  const flatToSharp: Record<string, string> = {
    DB: "C#",
    EB: "D#",
    GB: "F#",
    AB: "G#",
    BB: "A#",
  }
  if (root.length === 2 && root[1] === "B") {
    root = flatToSharp[root] ?? root
  }

  const SEMITONES = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ]

  const idx = SEMITONES.indexOf(root)
  if (idx === -1) {
    return chord
  }

  let newIdx = (idx + steps) % 12
  if (newIdx < 0) newIdx += 12
  const newRoot = SEMITONES[newIdx]
  return newRoot + rest
}

function ChordDiagram({ name }: { name: string }) {
  const shape = CHORD_SHAPES[normalizeChordName(name)] ?? []
  const stringLeft = (stringNumber: number) => 8 + ((stringNumber - 1) / 5) * 84

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background/70 p-4">
      <p className="text-center text-base font-bold">{name}</p>

      <div className="relative mx-auto mt-3 h-36 w-32">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={`v-${i}`}
            className="absolute bottom-0 top-1 w-px bg-foreground/25"
            style={{ left: `${stringLeft(i + 1)}%` }}
          />
        ))}

        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={`h-${i}`}
            className="absolute left-0 right-0 h-px bg-foreground/25"
            style={{ top: `${(i / 5) * 100}%` }}
          />
        ))}

        <span className="absolute left-0 right-0 top-0 h-1 rounded bg-foreground/85" />

        {shape.map((dot, i) => (
          <span
            key={`${name}-${i}`}
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500"
            style={{
              left: `${stringLeft(dot.string)}%`,
              top: `${(dot.fret / 5) * 100}%`,
            }}
          />
        ))}
      </div>

      <p className="mt-2 text-center text-[11px] tracking-[0.15em] text-muted-foreground">
        E A D G B e
      </p>
    </div>
  )
}

export function SongDetailClient({ data }: { data: SongDetailViewModel }) {
  const [autoScroll, setAutoScroll] = useState(false)
  const [scrollSpeed, setScrollSpeed] = useState(1) // pixels per tick (tick=25ms)
  const [transpose, setTranspose] = useState(0) // semitone shift, positive = up, negative = down

  // helper for inline chord rendering
  function InlineChordLine({ text }: { text: string }) {
    if (text === "") {
      return <p className="text-2xl font-semibold leading-snug tracking-[-0.01em] sm:text-[2rem]">&nbsp;</p>
    }
    const parts = text.split(/(\[[A-G][^\]]*\])/g)
    return (
      <p className="text-xl font-semibold leading-snug tracking-[-0.01em] sm:text-[1.25rem] whitespace-pre-wrap">
        {parts.map((part, i) =>
          part.startsWith("[") ? (
            <span key={i} className="text-amber-500 font-bold">
              {`[${transposeChord(part.slice(1, -1), transpose)}]`}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>
    )
  }

  useEffect(() => {
    if (!autoScroll) {
      return
    }

    let accum = 0
    const intervalId = window.setInterval(() => {
      const amount = scrollSpeed * 0.1
      accum += amount
      const toScroll = Math.floor(accum)
      if (toScroll > 0) {
        window.scrollBy({ top: toScroll, left: 0 })
        accum -= toScroll
      }
    }, 25)

    return () => window.clearInterval(intervalId)
  }, [autoScroll])

  const transposedChords = useMemo(() => {
    return data.usedChords.map((c) => transposeChord(c, transpose))
  }, [data.usedChords, transpose])

  const watermark = useMemo(() => {
    return transposedChords.slice(0, 2)
  }, [transposedChords])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-8 px-4 py-10 lg:flex-row lg:items-start lg:justify-between lg:px-10">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {data.breadcrumbs.join(" > ")}
            </p>
            <h1 className="mt-3 text-5xl font-bold tracking-tight">{data.title}</h1>
            <p className="mt-2 text-2xl text-muted-foreground">{data.artists.join(", ")}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <MetaChip label={data.languageLabel} />
              <MetaChip label={data.difficultyLabel} />
              <MetaChip label={data.yearLabel} />
              <MetaChip label={`${data.usedChords.length} chords`} />
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
                <Heart className="h-4 w-4" />
                Save Song
              </button>
              <button
                aria-label="Share song"
                className="rounded-xl border border-border bg-card p-2.5 hover:bg-muted"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">{data.saveCountLabel}</p>
          </div>
        </div>

        <div className="border-t border-border bg-card/40">
          <div className="mx-auto flex w-full max-w-[1500px] items-center gap-2 px-4 py-3 lg:px-10">
            <p className="mr-2 text-xs font-bold tracking-[0.2em] text-amber-500">CHORDS USED:</p>
            {transposedChords.map((chord, idx) => (
              <span
                key={`${chord}-${idx}`}
                className="rounded-md border border-border bg-background px-3 py-1 text-sm font-semibold"
              >
                {chord}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[1500px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="relative border-r border-border px-4 py-8 lg:px-10">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <p className="absolute left-8 top-6 text-[240px] font-black leading-none text-foreground/[0.03]">
              {watermark[0] ?? "Am"}
            </p>
            <p className="absolute right-8 top-24 rotate-[38deg] text-[220px] font-black leading-none text-foreground/[0.03]">
              {watermark[1] ?? "Em"}
            </p>
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <p className="text-sm font-bold tracking-[0.2em] text-amber-500">LYRICS & CHORDS</p>
            <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-500"
            >
              <Play className="h-3.5 w-3.5" />
              {autoScroll ? "Stop Scroll" : "Auto Scroll"}
            </button>
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground">Speed:</label>
              <input
                type="range"
                min={1}
                max={10}
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(Number(e.target.value))}
                className="h-1 w-20"
              />
              <span className="text-xs text-amber-500">{scrollSpeed}</span>
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground">Transpose:</label>
              <button
                onClick={() => setTranspose((t) => t - 1)}
                className="inline-flex items-center justify-center h-5 w-5 rounded border border-border bg-card text-xs font-semibold hover:bg-muted"
              >
                −
              </button>
              <span className="text-xs text-amber-500">
                {transpose === 0 ? 0 : transpose > 0 ? `+${transpose}` : transpose}
              </span>
              <button
                onClick={() => setTranspose((t) => t + 1)}
                className="inline-flex items-center justify-center h-5 w-5 rounded border border-border bg-card text-xs font-semibold hover:bg-muted"
              >
                +
              </button>
              {transpose !== 0 && (
                <button
                  onClick={() => setTranspose(0)}
                  className="ml-2 text-xs text-muted-foreground hover:underline"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          </div>

          <div className="relative z-10 mt-6 space-y-6">
            {data.lyricSections.map((section, si) => (
              <div key={si}>
                <div className="space-y-4">
                  {section.lines.map((line) => (
                    <div key={line.id}>
                      {/* If we have aligned chord-word pairs, show them with proper alignment */}
                      {line.rawContent ? (
                        // show chords inline in same line using rawContent
                        <InlineChordLine text={line.rawContent} />
                      ) : line.chordWords && line.chordWords.length > 0 ? (
                        <div>
                          {/* Chords line */}
                          <div className="mb-1 flex flex-wrap gap-2 text-base font-bold text-amber-500">
                            {line.chordWords.map((item, i) => (
                              <div
                                key={`chord-${line.id}-${i}`}
                                className="inline-block"
                                style={{ width: `${item.word.length * 0.6}em` }}
                              >
                                {item.chord && (
                                  <div className="text-center">
                                    {transposeChord(item.chord, transpose)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {/* Words line */}
                          <p className="text-2xl font-semibold leading-snug tracking-[-0.01em] sm:text-[2rem] flex flex-wrap gap-2">
                            {line.chordWords.map((item, i) => (
                              <span key={`word-${line.id}-${i}`}>{item.word}</span>
                            ))}
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Fallback: old display method for lines without chordWords */}
                          <div className="mb-2 flex flex-wrap gap-7 text-xl font-bold text-amber-500 ">
                            {(line.chords.length > 0 ? line.chords : [""]).map((chord, i) => (
                              <span key={`${line.id}-${i}`}>{transposeChord(chord, transpose)}</span>
                            ))}
                          </div>
                          <p className="text-2xl font-semibold leading-snug tracking-[-0.01em] sm:text-[2rem]">
                            {line.lyric}
                          </p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="space-y-5 p-4 lg:p-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-bold tracking-[0.2em] text-amber-500">CHORD DIAGRAMS</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {transposedChords.slice(0, 4).map((chord, idx) => (
                <ChordDiagram key={`${chord}-${idx}`} name={chord} />
              ))}
            </div>
          </div>

          {data.relatedSongs.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              {data.relatedSongs.map((song, index) => (
                <div key={song.id} className={index === 0 ? "pb-5" : "border-t border-border pt-5"}>
                  <Link href={`/songs/${song.slug}`} className="text-lg font-semibold hover:text-amber-500">
                    {song.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">{song.artist}</p>
                  <p className="mt-2 text-xs font-medium tracking-[0.12em] text-muted-foreground">
                    {song.chords.join("   ")}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-2xl border border-amber-500 bg-amber-500/10 p-6">
            <p className="text-xs font-bold tracking-[0.2em] text-amber-500">ALMOST THERE</p>
            <p className="mt-3 text-3xl font-bold leading-tight">
              Learn [{data.unlockChord}] to unlock {data.unlockCount} more songs
            </p>
            <p className="mt-2 text-base text-muted-foreground">
              This is the highest impact chord for your library right now.
            </p>
            <button className="mt-5 w-full rounded-xl bg-amber-500 py-3 text-base font-bold text-black hover:bg-amber-400">
              LEARN {data.unlockChord} CHORD
            </button>
          </div>
        </aside>
      </section>
    </div>
  )
}

function MetaChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold">
      {label}
    </span>
  )
}
