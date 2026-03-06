"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Heart, Play, Share2 } from "lucide-react"

import type { SongDetailViewModel } from "./song-detail-types"

function normalizeChordName(chord: string): string {
  return chord
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")
    .toUpperCase()
}

function transposeChord(chord: string, steps: number): string {
  if (steps === 0) return chord

  const normalized = normalizeChordName(chord)
  const match = normalized.match(/^([A-G][#B]?)(.*)$/)
  if (!match) {
    return chord
  }

  const [, initialRoot, rest] = match
  let root = initialRoot
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

  const SEMITONES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

  const idx = SEMITONES.indexOf(root)
  if (idx === -1) return chord

  let newIdx = (idx + steps) % 12
  if (newIdx < 0) newIdx += 12
  return SEMITONES[newIdx] + rest
}

/* ---------------- CHORD ENGINE ---------------- */

const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5,
  "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11,
}

function parseChord(chord: string) {
  const m = chord.match(/^([A-G])([#b]?)(m?)/)
  if (!m) return null
  return {
    root: (m[1] + (m[2] || "")).toUpperCase(),
    minor: m[3] === "m",
  }
}

function generateChord(chord: string) {
  const parsed = parseChord(chord)
  if (!parsed) return null

  const { root, minor } = parsed
  const rootIndex = NOTE_INDEX[root]

  // --- E-shape barre (root on low E string) ---
  const eDiff = (() => {
    let d = rootIndex - NOTE_INDEX["E"]
    if (d < 0) d += 12
    return d
  })()

  const eShapeFrets   = minor ? [0, 2, 2, 0, 0, 0] : [0, 2, 2, 1, 0, 0]
  const eShapeFingers = minor ? [1, 3, 4, 1, 1, 1] : [1, 3, 4, 2, 1, 1]
  const eFrets = eShapeFrets.map((f) => (f <= 0 ? f : f + eDiff))
  const eBaseFret = eDiff === 0 ? 1 : eDiff
  const eBarre = eDiff > 0 ? { fret: eDiff, finger: 1 } : null

  // --- A-shape barre (root on A string) ---
  const aDiff = (() => {
    let d = rootIndex - NOTE_INDEX["A"]
    if (d < 0) d += 12
    return d
  })()

  // A-shape relative frets (0 = open/nut, -1 = muted)
  const aShapeFrets   = minor ? [-1, 0, 2, 2, 1, 0] : [-1, 0, 2, 2, 2, 0]
  const aShapeFingers = minor ? [ 0, 1, 3, 4, 2, 1] : [ 0, 1, 2, 3, 4, 0]
  const aFrets = aShapeFrets.map((f) => (f <= 0 ? f : f + aDiff))
  const aBaseFret = aDiff === 0 ? 1 : aDiff
  const aBarre = aDiff > 0 ? { fret: aDiff, finger: 1 } : null

  // Prefer A-shape when it sits lower on the neck (more practical)
  const useAShape = aBaseFret <= eBaseFret && aBaseFret <= 7

  if (useAShape) {
    return {
      frets: aFrets,
      fingers: aShapeFingers,
      baseFret: aBaseFret,
      barre: aBarre,
    }
  }

  return {
    frets: eFrets,
    fingers: eShapeFingers,
    baseFret: eBaseFret,
    barre: eBarre,
  }
}

/* ---------------- CHORD DIAGRAM ---------------- */

function ScalesChordsDiagram({ chord }: { chord: string }) {
  const data = generateChord(chord)

  if (!data) {
    return <div className="text-xs text-muted-foreground">{chord}</div>
  }

  const { frets, fingers, baseFret, barre } = data
  const stringLabels = ["E", "A", "D", "G", "B", "e"]

  const stringSpacing = 28
  const fretSpacing = 44
  const startX = 40  // room for fret number label on the left
  const startY = 12  // tight top margin

  const gridWidth = 5 * stringSpacing
  const svgWidth = startX + gridWidth + 12
  const svgHeight = startY + 4 * fretSpacing + 20  // 20 for string labels at bottom

  return (
    <div className="flex flex-col items-center w-full">
      <div className="text-sm font-bold text-white mb-1">{chord}</div>
      <svg width={svgWidth} height={svgHeight} style={{ display: "block" }}>

        {/* strings (vertical lines) */}
        {frets.map((_: any, i: number) => (
          <line
            key={i}
            x1={startX + i * stringSpacing}
            y1={startY}
            x2={startX + i * stringSpacing}
            y2={startY + 4 * fretSpacing}
            stroke="#4b5563"
            strokeWidth={1.5}
          />
        ))}

        {/* frets (horizontal lines) */}
        {[0, 1, 2, 3, 4].map((f) => (
          <line
            key={f}
            x1={startX}
            y1={startY + f * fretSpacing}
            x2={startX + gridWidth}
            y2={startY + f * fretSpacing}
            stroke="#4b5563"
            strokeWidth={f === 0 && baseFret === 1 ? 5 : 1.5}
          />
        ))}

        {/* fret number label — centred in the first fret slot (between line 0 and line 1) */}
        {baseFret > 1 && (
          <text
            x={startX - 14}
            y={startY + fretSpacing * 0.5}
            fill="#9ca3af"
            fontSize="12"
            textAnchor="end"
            dominantBaseline="middle"
          >
            {baseFret}
          </text>
        )}

        {/* barre — centred in the first fret slot */}
        {barre && (
          <>
            <rect
              x={startX - 9}
              y={startY + fretSpacing * 0.5 - 9}
              width={gridWidth + 18}
              height="18"
              rx="9"
              fill="#f59e0b"
            />
            <text
              x={startX + gridWidth / 2}
              y={startY + fretSpacing * 0.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fontWeight="bold"
              fill="#000"
            >
              1
            </text>
          </>
        )}

        {/* finger dots — positioned relative to baseFret */}
        {frets.map((fret: number, i: number) => {
          if (fret <= 0) return null
          if (barre && fingers[i] === 1) return null  // covered by barre pill

          // slot 0 = first fret slot (between fret line 0 and 1), etc.
          const slot = fret - baseFret
          const cy = startY + slot * fretSpacing + fretSpacing * 0.5

          return (
            <g key={i}>
              <circle cx={startX + i * stringSpacing} cy={cy} r="10" fill="#f59e0b" />
              <text
                x={startX + i * stringSpacing}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="bold"
                fill="#000"
              >
                {fingers[i]}
              </text>
            </g>
          )
        })}

        {/* string labels */}
        {stringLabels.map((label, i) => (
          <text
            key={i}
            x={startX + i * stringSpacing}
            y={startY + 4 * fretSpacing + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#6b7280"
            fontSize="11"
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  )
}

export function SongDetailClient({ data }: { data: SongDetailViewModel }) {
  const [autoScroll, setAutoScroll] = useState(false)
  const [scrollSpeed, setScrollSpeed] = useState(1)
  const [transpose, setTranspose] = useState(0)
  const [showTransposeControls, setShowTransposeControls] = useState(false)

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
    if (!autoScroll) return

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
  }, [autoScroll, scrollSpeed])

  const transposedChords = useMemo(() => {
    return data.usedChords.map((c) => transposeChord(c, transpose))
  }, [data.usedChords, transpose])

  const diagramChords = useMemo(() => {
    return Array.from(new Set(transposedChords))
  }, [transposedChords])

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
            <p className="mt-2 text-2xl text-muted-foreground">{data.artists.join(" - ")}</p>

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

      <section className="mx-auto grid w-full max-w-[1500px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_560px]">
        <div className="relative border-r border-border px-4 py-8 lg:px-10">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <p className="absolute left-8 top-6 text-[240px] font-black leading-none text-foreground/[0.03]">
              {watermark[0] ?? "Am"}
            </p>
            <p className="absolute right-8 top-24 rotate-[38deg] text-[220px] font-black leading-none text-foreground/[0.03]">
              {watermark[1] ?? "Em"}
            </p>
          </div>

          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between">
            <p className="text-sm font-bold tracking-[0.2em] text-amber-500">LYRICS & CHORDS</p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-2 sm:mt-0">
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
              <div className="hidden sm:flex items-center gap-1">
                <label className="text-xs text-muted-foreground">Transpose:</label>
                <button
                  onClick={() => setTranspose((t) => t - 1)}
                  className="inline-flex items-center justify-center h-5 w-5 rounded border border-border bg-card text-xs font-semibold hover:bg-muted"
                >
                  -
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
              <button
                onClick={() => setShowTransposeControls((v) => !v)}
                className="sm:hidden inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold"
              >
                Transpose
              </button>
            </div>
          </div>

          {showTransposeControls && (
            <div className="mt-2 flex items-center gap-1 sm:hidden">
              <label className="text-xs text-muted-foreground">Transpose:</label>
              <button
                onClick={() => setTranspose((t) => t - 1)}
                className="inline-flex items-center justify-center h-5 w-5 rounded border border-border bg-card text-xs font-semibold hover:bg-muted"
              >
                -
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
          )}

          <div className="relative z-10 mt-6 space-y-6">
            {data.lyricSections.map((section, si) => (
              <div key={si}>
                <div className="space-y-4">
                  {section.lines.map((line) => (
                    <div key={line.id}>
                      {line.rawContent ? (
                        <InlineChordLine text={line.rawContent} />
                      ) : line.chordWords && line.chordWords.length > 0 ? (
                        <div>
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
                          <p className="text-2xl font-semibold leading-snug tracking-[-0.01em] sm:text-[2rem] flex flex-wrap gap-2">
                            {line.chordWords.map((item, i) => (
                              <span key={`word-${line.id}-${i}`}>{item.word}</span>
                            ))}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="mb-2 flex flex-wrap gap-7 text-xl font-bold text-amber-500">
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

        <aside className="space-y-4 p-3 lg:p-4">
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-xs font-bold tracking-[0.2em] text-amber-500">CHORD DIAGRAMS</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {diagramChords.map((chord, idx) => (
                <div
                  key={`${chord}-${idx}`}
                  className="rounded-xl border border-border bg-background/30 py-2 px-0"
                >
                  <div className="flex justify-center">
                    <ScalesChordsDiagram chord={chord} />
                  </div>
                </div>
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