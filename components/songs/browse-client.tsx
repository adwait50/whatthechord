"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { SongCard } from "./song-card"
import { ChordSelector } from "./chord-selector"

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
  type: string
  root: string
  isSlash: boolean
}

type Props = {
  initialSongs: Song[]
  total: number
}

const BASIC_CHORD_PRIORITY = ["A", "AM", "C", "D", "DM", "E", "EM", "F", "G", "BM", "B7", "A#"]
const TYPE_ORDER = ["major", "minor", "maj7", "m7", "7", "sus4", "sus2", "add9", "9", "11", "13"]
const ROOT_ORDER = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"]

function typeLabel(type: string): string {
  if (type === "major") return "Major"
  if (type === "minor") return "Minor"
  if (type === "other") return "Other"
  return type
}

function compareType(a: string, b: string): number {
  const aIndex = TYPE_ORDER.indexOf(a)
  const bIndex = TYPE_ORDER.indexOf(b)
  if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
  if (aIndex >= 0) return -1
  if (bIndex >= 0) return 1
  return a.localeCompare(b)
}

function compareRoot(a: string, b: string): number {
  const aIndex = ROOT_ORDER.indexOf(a)
  const bIndex = ROOT_ORDER.indexOf(b)
  if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
  if (aIndex >= 0) return -1
  if (bIndex >= 0) return 1
  return a.localeCompare(b)
}

function normalizeChordName(chord: string): string {
  return chord
    .replace(/\u266F/g, "#")
    .replace(/\u266D/g, "b")
    .replace(/\s+/g, "")
    .toUpperCase()
}

export function BrowseClient({ initialSongs, total }: Props) {
  const [songs, setSongs] = useState(initialSongs)
  const [songsTotal, setSongsTotal] = useState(total)
  const [selectedChords, setSelectedChords] = useState<number[]>([])
  const [search, setSearch] = useState("")
  const [chordSearch, setChordSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [isMoreChordsOpen, setIsMoreChordsOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState("all")
  const [slashFilter, setSlashFilter] = useState<"all" | "only" | "exclude">("all")
  const [groupMode, setGroupMode] = useState<"none" | "type" | "root">("none")

  const [apiChords, setApiChords] = useState<Chord[]>([])
  const [chordsLoading, setChordsLoading] = useState(true)
  const [chordsError, setChordsError] = useState<string | null>(null)
  const [remoteSearchChords, setRemoteSearchChords] = useState<Chord[] | null>(null)
  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadChordsFromApi() {
      setChordsLoading(true)
      setChordsError(null)

      try {
        const res = await fetch("/api/chords/catalog", {
          signal: controller.signal,
        })
        const payload = (await res.json()) as {
          chords?: Chord[]
          error?: string
        }

        if (controller.signal.aborted) return
        const loadedChords = payload.chords ?? []
        setApiChords(loadedChords)
        setChordsError(loadedChords.length === 0 ? (payload.error ?? null) : null)
      } catch {
        if (!controller.signal.aborted) {
          setApiChords([])
          setChordsError("Unable to load chords from your catalog.")
        }
      } finally {
        if (!controller.signal.aborted) setChordsLoading(false)
      }
    }

    void loadChordsFromApi()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const validIds = new Set(apiChords.map((chord) => chord.id))
    setSelectedChords((current) => current.filter((id) => validIds.has(id)))
  }, [apiChords])

  const basicChords = useMemo(() => {
    const usedIds = new Set<number>()
    const byName = new Map<string, Chord>()

    apiChords.forEach((chord) => {
      byName.set(normalizeChordName(chord.name), chord)
    })

    const picked: Chord[] = []

    for (const target of BASIC_CHORD_PRIORITY) {
      const chord = byName.get(target)
      if (!chord) continue
      if (usedIds.has(chord.id)) continue
      usedIds.add(chord.id)
      picked.push(chord)
    }

    if (picked.length < 12) {
      for (const chord of apiChords) {
        if (usedIds.has(chord.id)) continue
        usedIds.add(chord.id)
        picked.push(chord)
        if (picked.length >= 12) break
      }
    }

    return picked
  }, [apiChords])

  const selectedChordNames = useMemo(() => {
    const idSet = new Set(selectedChords)
    return apiChords.filter((chord) => idSet.has(chord.id)).map((chord) => chord.name)
  }, [apiChords, selectedChords])

  useEffect(() => {
    const query = chordSearch.trim()
    if (!isMoreChordsOpen || query.length === 0) {
      setRemoteSearchChords(null)
      setRemoteSearchLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setRemoteSearchLoading(true)
      try {
        const res = await fetch(`/api/chords/catalog?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        const payload = (await res.json()) as { chords?: Chord[] }
        if (!controller.signal.aborted) {
          setRemoteSearchChords(payload.chords ?? [])
        }
      } catch {
        if (!controller.signal.aborted) setRemoteSearchChords([])
      } finally {
        if (!controller.signal.aborted) setRemoteSearchLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [chordSearch, isMoreChordsOpen])

  const filteredMoreChords = useMemo(() => {
    const query = chordSearch.trim()
    if (!query) return apiChords
    return remoteSearchChords ?? []
  }, [apiChords, chordSearch, remoteSearchChords])

  const availableTypes = useMemo(() => {
    const types = Array.from(new Set(apiChords.map((chord) => chord.type || "other")))
    return types.sort(compareType)
  }, [apiChords])

  useEffect(() => {
    if (typeFilter === "all") return
    if (availableTypes.includes(typeFilter)) return
    setTypeFilter("all")
  }, [availableTypes, typeFilter])

  const displayMoreChords = useMemo(() => {
    let filtered = filteredMoreChords

    if (typeFilter !== "all") {
      filtered = filtered.filter((chord) => chord.type === typeFilter)
    }

    if (slashFilter === "only") {
      filtered = filtered.filter((chord) => chord.isSlash)
    } else if (slashFilter === "exclude") {
      filtered = filtered.filter((chord) => !chord.isSlash)
    }

    return [...filtered].sort((a, b) => {
      const rootCompare = compareRoot(a.root, b.root)
      if (rootCompare !== 0) return rootCompare

      const typeCompare = compareType(a.type, b.type)
      if (typeCompare !== 0) return typeCompare

      return a.name.localeCompare(b.name)
    })
  }, [filteredMoreChords, typeFilter, slashFilter])

  const groupedMoreChords = useMemo(() => {
    if (groupMode === "none") return []

    const groups = new Map<string, Chord[]>()

    for (const chord of displayMoreChords) {
      const key = groupMode === "root" ? chord.root || "other" : chord.type || "other"
      const existing = groups.get(key)
      if (existing) {
        existing.push(chord)
      } else {
        groups.set(key, [chord])
      }
    }

    const ordered: { groupKey: string; chords: Chord[] }[] = []

    if (groupMode === "type") {
      for (const type of TYPE_ORDER) {
        const items = groups.get(type)
        if (!items || items.length === 0) continue
        ordered.push({ groupKey: type, chords: items })
        groups.delete(type)
      }
    }

    const remaining = Array.from(groups.entries()).sort((a, b) => {
      if (groupMode === "root") return compareRoot(a[0], b[0])
      return compareType(a[0], b[0])
    })
    for (const [groupKey, chords] of remaining) {
      ordered.push({ groupKey, chords })
    }

    return ordered
  }, [displayMoreChords, groupMode])

  useEffect(() => {
    if (!isMoreChordsOpen) return

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMoreChordsOpen(false)
    }

    window.addEventListener("keydown", onEscape)
    return () => window.removeEventListener("keydown", onEscape)
  }, [isMoreChordsOpen])

  const fetchSongs = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    const params = new URLSearchParams()

    if (selectedChordNames.length > 0) {
      params.set("chordNames", selectedChordNames.join(","))
    }
    if (search) {
      params.set("search", search)
    }

    try {
      const res = await fetch(`/api/songs?${params}`, signal ? { signal } : undefined)
      const data = (await res.json()) as { songs?: Song[]; total?: number }
      if (signal?.aborted) return
      setSongs(data.songs ?? [])
      if (typeof data.total === "number") {
        setSongsTotal(data.total)
      }
    } catch {
      if (!signal?.aborted) {
        setSongs([])
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false)
      }
    }
  }, [search, selectedChordNames])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetchSongs(controller.signal)
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [fetchSongs])

  const toggleChord = (chordId: number) => {
    setSelectedChords((prev) =>
      prev.includes(chordId)
        ? prev.filter((id) => id !== chordId)
        : [...prev, chordId]
    )
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main>
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search songs or artists..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void fetchSongs()
                  }
                }}
                className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 transition-colors focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <p className="text-muted-foreground">
                {loading ? "Loading..." : `Showing ${songs.length} songs`}
              </p>
              <span className="text-muted-foreground/70">of {songsTotal}</span>
              {selectedChords.length > 0 ? (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500">
                  {selectedChords.length} chord filters active
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {songs.map((song) => (
              <SongCard key={song.id} song={song} />
            ))}
          </div>

          {songs.length === 0 && !loading && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                No songs found. Try selecting different chords.
              </p>
            </div>
          )}
        </main>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6">
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-500">
              Basic Chords
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Loaded from your chord catalog.
            </p>
          </div>

          {chordsLoading ? (
            <p className="text-sm text-muted-foreground">Loading chords...</p>
          ) : basicChords.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No chords available in your catalog right now.
            </p>
          ) : (
            <ChordSelector
              chords={basicChords}
              selectedChords={selectedChords}
              onToggle={toggleChord}
              columnsClassName="grid-cols-4"
            />
          )}

          {chordsError ? (
            <p className="mt-3 text-xs text-amber-500">{chordsError}</p>
          ) : null}

          <div className="mt-5 space-y-2">
            <button
              onClick={() => setIsMoreChordsOpen(true)}
              className="w-full rounded-lg border border-border bg-background py-2 text-sm font-semibold transition-colors hover:bg-muted"
            >
              More Chords
            </button>
            {selectedChords.length > 0 ? (
              <button
                onClick={() => setSelectedChords([])}
                className="w-full rounded-lg border border-border bg-background py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
              >
                Clear Chord Selection
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      {isMoreChordsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            aria-label="Close more chords popup"
            onClick={() => setIsMoreChordsOpen(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="relative z-10 flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-background">
            <div className="border-b border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">
                    More Chords
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Full chord list from your catalog with search.
                  </p>
                </div>
                <button
                  aria-label="Close"
                  onClick={() => setIsMoreChordsOpen(false)}
                  className="rounded-lg border border-border bg-card p-2 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={chordSearch}
                  onChange={(event) => setChordSearch(event.target.value)}
                  placeholder="Search chords..."
                  className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>

                <select
                  value={slashFilter}
                  onChange={(event) => setSlashFilter(event.target.value as "all" | "only" | "exclude")}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                >
                  <option value="all">All Chords</option>
                  <option value="only">Slash Only</option>
                  <option value="exclude">No Slash</option>
                </select>

                <select
                  value={groupMode}
                  onChange={(event) => setGroupMode(event.target.value as "none" | "type" | "root")}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                >
                  <option value="none">No Grouping</option>
                  <option value="type">Group by Type</option>
                  <option value="root">Group by Root</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {chordsLoading || remoteSearchLoading ? (
                <p className="text-sm text-muted-foreground">Loading chords...</p>
              ) : displayMoreChords.length === 0 ? (
                <p className="text-sm text-muted-foreground">No chords found for this search.</p>
              ) : groupMode === "none" ? (
                <ChordSelector
                  chords={displayMoreChords}
                  selectedChords={selectedChords}
                  onToggle={toggleChord}
                  columnsClassName="grid-cols-4 sm:grid-cols-5 lg:grid-cols-6"
                />
              ) : (
                <div className="space-y-5">
                  {groupedMoreChords.map((group) => (
                    <section key={group.groupKey}>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">
                          {groupMode === "type" ? typeLabel(group.groupKey) : group.groupKey}
                        </p>
                        <p className="text-xs text-muted-foreground">{group.chords.length}</p>
                      </div>
                      <ChordSelector
                        chords={group.chords}
                        selectedChords={selectedChords}
                        onToggle={toggleChord}
                        columnsClassName="grid-cols-4 sm:grid-cols-5 lg:grid-cols-6"
                      />
                    </section>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {selectedChords.length} chords selected
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    Filters apply automatically in real time.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedChords([])}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setIsMoreChordsOpen(false)}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
