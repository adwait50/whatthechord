"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Search, X, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"
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

const PAGE_SIZE = 24

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular" },
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
]

const DECADE_OPTIONS = ["All", "2020s", "2010s", "2000s", "1990s", "1980s", "1970s", "1960s"]
const LANGUAGE_OPTIONS = ["All", "English", "Hindi", "Spanish", "French", "Portuguese", "Other"]
const DIFFICULTY_OPTIONS = ["All", "Beginner", "Intermediate", "Advanced"]

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

  // Sort & filter state
  const [sortBy, setSortBy] = useState("popular")
  const [decadeFilter, setDecadeFilter] = useState("All")
  const [languageFilter, setLanguageFilter] = useState("All")
  const [difficultyFilter, setDifficultyFilter] = useState("All")
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(songsTotal / PAGE_SIZE))

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
        const res = await fetch("/api/chords/catalog", { signal: controller.signal })
        const payload = (await res.json()) as { chords?: Chord[]; error?: string }

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
    apiChords.forEach((chord) => byName.set(normalizeChordName(chord.name), chord))

    const picked: Chord[] = []
    for (const target of BASIC_CHORD_PRIORITY) {
      const chord = byName.get(target)
      if (!chord || usedIds.has(chord.id)) continue
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
        const res = await fetch(`/api/chords/catalog?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        const payload = (await res.json()) as { chords?: Chord[] }
        if (!controller.signal.aborted) setRemoteSearchChords(payload.chords ?? [])
      } catch {
        if (!controller.signal.aborted) setRemoteSearchChords([])
      } finally {
        if (!controller.signal.aborted) setRemoteSearchLoading(false)
      }
    }, 250)

    return () => { controller.abort(); window.clearTimeout(timer) }
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
    if (typeFilter !== "all") filtered = filtered.filter((chord) => chord.type === typeFilter)
    if (slashFilter === "only") filtered = filtered.filter((chord) => chord.isSlash)
    else if (slashFilter === "exclude") filtered = filtered.filter((chord) => !chord.isSlash)

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
      if (existing) existing.push(chord)
      else groups.set(key, [chord])
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

    const remaining = Array.from(groups.entries()).sort((a, b) =>
      groupMode === "root" ? compareRoot(a[0], b[0]) : compareType(a[0], b[0])
    )
    for (const [groupKey, chords] of remaining) ordered.push({ groupKey, chords })
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

  const fetchSongs = useCallback(async (signal?: AbortSignal, targetPage = page) => {
    setLoading(true)
    const params = new URLSearchParams()

    if (selectedChordNames.length > 0) params.set("chordNames", selectedChordNames.join(","))
    if (search) params.set("search", search)
    params.set("sort", sortBy)
    params.set("page", String(targetPage))
    params.set("pageSize", String(PAGE_SIZE))
    if (decadeFilter !== "All") params.set("decade", decadeFilter)
    if (languageFilter !== "All") params.set("language", languageFilter)
    if (difficultyFilter !== "All") params.set("difficulty", difficultyFilter)

    try {
      const res = await fetch(`/api/songs?${params}`, signal ? { signal } : undefined)
      const data = (await res.json()) as { songs?: Song[]; total?: number }
      if (signal?.aborted) return
      setSongs(data.songs ?? [])
      if (typeof data.total === "number") setSongsTotal(data.total)
    } catch {
      if (!signal?.aborted) setSongs([])
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [search, selectedChordNames, sortBy, page, decadeFilter, languageFilter, difficultyFilter])

  // Reset to page 1 when filters/search/sort change (not page itself)
  useEffect(() => {
    setPage(1)
  }, [search, selectedChordNames, sortBy, decadeFilter, languageFilter, difficultyFilter])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetchSongs(controller.signal, page)
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [fetchSongs, page])

  const toggleChord = (chordId: number) => {
    setSelectedChords((prev) =>
      prev.includes(chordId) ? prev.filter((id) => id !== chordId) : [...prev, chordId]
    )
  }

  const activeFilterCount = [
    decadeFilter !== "All",
    languageFilter !== "All",
    difficultyFilter !== "All",
  ].filter(Boolean).length

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main>
          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search songs or artists..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void fetchSongs() }}
                className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 transition-colors focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <p className="text-muted-foreground">
                {loading ? "Loading..." : `Showing ${songs.length} of ${songsTotal} songs`}
              </p>
              {selectedChords.length > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500">
                  {selectedChords.length} chord filters active
                </span>
              )}
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500">
                  {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
                </span>
              )}
            </div>
          </div>

          {/* Song grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {songs.map((song) => (
              <SongCard key={song.id} song={song} />
            ))}
          </div>

          {songs.length === 0 && !loading && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No songs found. Try selecting different chords or filters.</p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  // Show pages around current page
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (page <= 3) {
                    pageNum = i + 1
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = page - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      disabled={loading}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                        pageNum === page
                          ? "bg-amber-500 text-black"
                          : "border border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside className="h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6 space-y-6">

          {/* Chord selector */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-3">
              Filter by Chords
            </h3>

            {chordsLoading ? (
              <p className="text-sm text-muted-foreground">Loading chords...</p>
            ) : basicChords.length === 0 ? (
              <p className="text-sm text-muted-foreground">No chords available in your catalog right now.</p>
            ) : (
              <ChordSelector
                chords={basicChords}
                selectedChords={selectedChords}
                onToggle={toggleChord}
                columnsClassName="grid-cols-4"
              />
            )}

            {chordsError && <p className="mt-3 text-xs text-amber-500">{chordsError}</p>}

            <div className="mt-4 space-y-2">
              <button
                onClick={() => setIsMoreChordsOpen(true)}
                className="w-full rounded-lg border border-border bg-background py-2 text-sm font-semibold transition-colors hover:bg-muted"
              >
                More Chords
              </button>
              {selectedChords.length > 0 && (
                <button
                  onClick={() => setSelectedChords([])}
                  className="w-full rounded-lg border border-border bg-background py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
                >
                  Clear Chord Selection
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Sort */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-3">
              Sort By
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSortBy(option.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                    sortBy === option.value
                      ? "border-amber-500 bg-amber-500/10 text-amber-500"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Filters */}
          <div>
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex w-full items-center justify-between"
            >
              <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-500">
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-black">
                    {activeFilterCount}
                  </span>
                )}
              </h3>
              <span className="text-xs text-muted-foreground">{filtersOpen ? "▲" : "▼"}</span>
            </button>

            {filtersOpen && (
              <div className="mt-3 space-y-4">
                {/* Decade */}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Decade</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DECADE_OPTIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDecadeFilter(d)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          decadeFilter === d
                            ? "border-amber-500 bg-amber-500/10 text-amber-500"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language */}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Language</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LANGUAGE_OPTIONS.map((l) => (
                      <button
                        key={l}
                        onClick={() => setLanguageFilter(l)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          languageFilter === l
                            ? "border-amber-500 bg-amber-500/10 text-amber-500"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Difficulty */}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Difficulty</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DIFFICULTY_OPTIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDifficultyFilter(d)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          difficultyFilter === d
                            ? "border-amber-500 bg-amber-500/10 text-amber-500"
                            : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setDecadeFilter("All")
                      setLanguageFilter("All")
                      setDifficultyFilter("All")
                    }}
                    className="w-full rounded-lg border border-border bg-background py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            )}
          </div>

        </aside>
      </div>

      {/* More Chords Modal */}
      {isMoreChordsOpen && (
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
                  <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">More Chords</p>
                  <p className="mt-1 text-sm text-muted-foreground">Full chord list from your catalog with search.</p>
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
                    <option key={type} value={type}>{typeLabel(type)}</option>
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
                  <p className="text-sm text-muted-foreground">{selectedChords.length} chords selected</p>
                  <p className="text-xs text-muted-foreground/80">Filters apply automatically in real time.</p>
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
      )}
    </div>
  )
}