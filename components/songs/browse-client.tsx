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

// TODO: Re-enable when artist DB structure is fixed
// type Artist = {
//   id: number
//   name: string
//   songCount: number
// }

type Props = {
  initialSongs: Song[]
  total: number
}

const BASIC_CHORD_PRIORITY = ["A", "AM", "C", "D", "DM", "E", "EM", "F", "G", "BM", "B7", "A#"]
const TYPE_ORDER = ["major", "minor", "maj7", "m7", "7", "sus4", "sus2", "add9", "9", "11", "13"]
const ROOT_ORDER = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"]

const PAGE_SIZE = 24

const SORT_OPTIONS = [
  { value: "popular",    label: "Most Popular" },
  { value: "newest",     label: "Newest First" },
  { value: "oldest",     label: "Oldest First" },
  { value: "title_asc",  label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
]

const DECADE_OPTIONS   = ["All", "2020s", "2010s", "2000s", "1990s", "1980s", "1970s", "1960s"]
const LANGUAGE_OPTIONS = ["All", "English", "Hindi", "Spanish", "French", "Portuguese", "Other"]

function typeLabel(type: string): string {
  if (type === "major") return "Major"
  if (type === "minor") return "Minor"
  if (type === "other") return "Other"
  return type
}

function compareType(a: string, b: string): number {
  const ai = TYPE_ORDER.indexOf(a), bi = TYPE_ORDER.indexOf(b)
  if (ai >= 0 && bi >= 0) return ai - bi
  if (ai >= 0) return -1
  if (bi >= 0) return 1
  return a.localeCompare(b)
}

function compareRoot(a: string, b: string): number {
  const ai = ROOT_ORDER.indexOf(a), bi = ROOT_ORDER.indexOf(b)
  if (ai >= 0 && bi >= 0) return ai - bi
  if (ai >= 0) return -1
  if (bi >= 0) return 1
  return a.localeCompare(b)
}

function normalizeChordName(chord: string): string {
  return chord.replace(/\u266F/g, "#").replace(/\u266D/g, "b").replace(/\s+/g, "").toUpperCase()
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

  // Sort & filters
  const [sortBy, setSortBy] = useState("popular")
  const [decadeFilter, setDecadeFilter] = useState("All")
  const [languageFilter, setLanguageFilter] = useState("All")
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Mobile sidebar drawer
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(songsTotal / PAGE_SIZE))

  // Chords
  const [apiChords, setApiChords] = useState<Chord[]>([])
  const [chordsLoading, setChordsLoading] = useState(true)
  const [chordsError, setChordsError] = useState<string | null>(null)
  const [remoteSearchChords, setRemoteSearchChords] = useState<Chord[] | null>(null)
  const [remoteSearchLoading, setRemoteSearchLoading] = useState(false)

  // Load chords
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setChordsLoading(true); setChordsError(null)
      try {
        const res = await fetch("/api/chords/catalog", { signal: controller.signal })
        const payload = (await res.json()) as { chords?: Chord[]; error?: string }
        if (controller.signal.aborted) return
        const loaded = payload.chords ?? []
        setApiChords(loaded)
        setChordsError(loaded.length === 0 ? (payload.error ?? null) : null)
      } catch {
        if (!controller.signal.aborted) { setApiChords([]); setChordsError("Unable to load chords.") }
      } finally {
        if (!controller.signal.aborted) setChordsLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  // Lock body scroll when mobile sidebar/modal is open
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [mobileSidebarOpen])

  useEffect(() => {
    const validIds = new Set(apiChords.map((c) => c.id))
    setSelectedChords((cur) => cur.filter((id) => validIds.has(id)))
  }, [apiChords])

  const basicChords = useMemo(() => {
    const usedIds = new Set<number>()
    const byName = new Map<string, Chord>()
    apiChords.forEach((c) => byName.set(normalizeChordName(c.name), c))
    const picked: Chord[] = []
    for (const target of BASIC_CHORD_PRIORITY) {
      const c = byName.get(target)
      if (!c || usedIds.has(c.id)) continue
      usedIds.add(c.id); picked.push(c)
    }
    if (picked.length < 12) {
      for (const c of apiChords) {
        if (usedIds.has(c.id)) continue
        usedIds.add(c.id); picked.push(c)
        if (picked.length >= 12) break
      }
    }
    return picked
  }, [apiChords])

  const selectedChordNames = useMemo(() => {
    const idSet = new Set(selectedChords)
    return apiChords.filter((c) => idSet.has(c.id)).map((c) => c.name)
  }, [apiChords, selectedChords])

  // Chord search in popup
  useEffect(() => {
    const query = chordSearch.trim()
    if (!isMoreChordsOpen || query.length === 0) {
      setRemoteSearchChords(null); setRemoteSearchLoading(false); return
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
    if (!chordSearch.trim()) return apiChords
    return remoteSearchChords ?? []
  }, [apiChords, chordSearch, remoteSearchChords])

  const availableTypes = useMemo(() => {
    return Array.from(new Set(apiChords.map((c) => c.type || "other"))).sort(compareType)
  }, [apiChords])

  useEffect(() => {
    if (typeFilter !== "all" && !availableTypes.includes(typeFilter)) setTypeFilter("all")
  }, [availableTypes, typeFilter])

  const displayMoreChords = useMemo(() => {
    let filtered = filteredMoreChords
    if (typeFilter !== "all") filtered = filtered.filter((c) => c.type === typeFilter)
    if (slashFilter === "only") filtered = filtered.filter((c) => c.isSlash)
    else if (slashFilter === "exclude") filtered = filtered.filter((c) => !c.isSlash)
    return [...filtered].sort((a, b) => {
      const r = compareRoot(a.root, b.root)
      if (r !== 0) return r
      const t = compareType(a.type, b.type)
      if (t !== 0) return t
      return a.name.localeCompare(b.name)
    })
  }, [filteredMoreChords, typeFilter, slashFilter])

  const groupedMoreChords = useMemo(() => {
    if (groupMode === "none") return []
    const groups = new Map<string, Chord[]>()
    for (const c of displayMoreChords) {
      const key = groupMode === "root" ? c.root || "other" : c.type || "other"
      const existing = groups.get(key)
      if (existing) existing.push(c)
      else groups.set(key, [c])
    }
    const ordered: { groupKey: string; chords: Chord[] }[] = []
    if (groupMode === "type") {
      for (const type of TYPE_ORDER) {
        const items = groups.get(type)
        if (!items?.length) continue
        ordered.push({ groupKey: type, chords: items }); groups.delete(type)
      }
    }
    for (const [groupKey, chords] of Array.from(groups.entries()).sort((a, b) =>
      groupMode === "root" ? compareRoot(a[0], b[0]) : compareType(a[0], b[0])
    )) ordered.push({ groupKey, chords })
    return ordered
  }, [displayMoreChords, groupMode])

  useEffect(() => {
    if (!isMoreChordsOpen) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setIsMoreChordsOpen(false) }
    window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [isMoreChordsOpen])

  // Reset to page 1 when any filter/sort changes
  useEffect(() => { setPage(1) }, [search, selectedChords, sortBy, decadeFilter, languageFilter])

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
  }, [search, selectedChordNames, sortBy, decadeFilter, languageFilter, page])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void fetchSongs(controller.signal, page), 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [fetchSongs, page])

  const toggleChord = (chordId: number) => {
    setSelectedChords((prev) => prev.includes(chordId) ? prev.filter((id) => id !== chordId) : [...prev, chordId])
  }

  const activeFilterCount = [
    selectedChords.length > 0,
    decadeFilter !== "All",
    languageFilter !== "All",
    sortBy !== "popular",
  ].filter(Boolean).length

  // Shared sidebar content rendered in both desktop sidebar and mobile drawer
  const SidebarContent = () => (
    <div className="space-y-6">
      {/* Chord filter */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-3">Filter by Chords</h3>
        {chordsLoading ? (
          <p className="text-sm text-muted-foreground">Loading chords...</p>
        ) : basicChords.length === 0 ? (
          <p className="text-sm text-muted-foreground">No chords available.</p>
        ) : (
          <ChordSelector chords={basicChords} selectedChords={selectedChords} onToggle={toggleChord} columnsClassName="grid-cols-4" />
        )}
        {chordsError && <p className="mt-3 text-xs text-amber-500">{chordsError}</p>}
        <div className="mt-4 space-y-2">
          <button
            onClick={() => setIsMoreChordsOpen(true)}
            className="w-full rounded-lg border border-border bg-background py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
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
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-3">Sort By</h3>
        <div className="grid grid-cols-1 gap-2">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSortBy(option.value)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
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
        <button onClick={() => setFiltersOpen((v) => !v)} className="flex w-full items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-500">
            Filters
            {(decadeFilter !== "All" || languageFilter !== "All") && (
              <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-black">
                {[decadeFilter !== "All", languageFilter !== "All"].filter(Boolean).length}
              </span>
            )}
          </h3>
          <span className="text-xs text-muted-foreground">{filtersOpen ? "▲" : "▼"}</span>
        </button>

        {filtersOpen && (
          <div className="mt-3 space-y-4">
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
            {(decadeFilter !== "All" || languageFilter !== "All") && (
              <button
                onClick={() => { setDecadeFilter("All"); setLanguageFilter("All") }}
                className="w-full rounded-lg border border-border bg-background py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
              >
                Clear All Filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">

      {/* ── Mobile sticky top bar (search + filter button) ── */}
      <div className="sticky top-0 z-30 lg:hidden border-b border-border bg-background/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search songs or artists..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void fetchSongs() }}
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm transition-colors focus:border-amber-500 focus:outline-none"
            />
          </div>
          {/* Filter button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="relative flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold transition-colors active:bg-muted"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Active filter pills */}
        {(selectedChords.length > 0 || decadeFilter !== "All" || languageFilter !== "All") && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {selectedChords.length > 0 && (
              <button
                onClick={() => setSelectedChords([])}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500"
              >
                {selectedChords.length} chord{selectedChords.length > 1 ? "s" : ""} <X className="h-3 w-3" />
              </button>
            )}
            {decadeFilter !== "All" && (
              <button
                onClick={() => setDecadeFilter("All")}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500"
              >
                {decadeFilter} <X className="h-3 w-3" />
              </button>
            )}
            {languageFilter !== "All" && (
              <button
                onClick={() => setLanguageFilter("All")}
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500"
              >
                {languageFilter} <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile sidebar drawer ── */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <button
            aria-label="Close filters"
            onClick={() => setMobileSidebarOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          {/* Drawer panel slides in from right */}
          <div className="absolute right-0 top-0 flex h-full w-[85vw] max-w-sm flex-col bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-sm font-bold tracking-wide">Filters &amp; Sort</h2>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="rounded-lg border border-border p-1.5 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <SidebarContent />
            </div>
            <div className="border-t border-border p-4">
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-bold text-black hover:bg-amber-400 active:bg-amber-300"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-6 p-4 lg:p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main>
          {/* Desktop search bar — hidden on mobile (shown in sticky bar above) */}
          <div className="mb-6 hidden lg:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search songs or artists..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void fetchSongs() }}
                className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 transition-colors focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Active filter pills — desktop */}
            {(selectedChords.length > 0 || decadeFilter !== "All" || languageFilter !== "All") && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedChords.length > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500">
                    {selectedChords.length} chord{selectedChords.length > 1 ? "s" : ""} selected
                  </span>
                )}
                {decadeFilter !== "All" && (
                  <button
                    onClick={() => setDecadeFilter("All")}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/25"
                  >
                    {decadeFilter} <X className="h-3 w-3" />
                  </button>
                )}
                {languageFilter !== "All" && (
                  <button
                    onClick={() => setLanguageFilter("All")}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/25"
                  >
                    {languageFilter} <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Song grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {songs.map((song) => <SongCard key={song.id} song={song} />)}
          </div>

          {songs.length === 0 && !loading && (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No songs found. Try adjusting your filters.</p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) pageNum = i + 1
                  else if (page <= 3) pageNum = i + 1
                  else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                  else pageNum = page - 2 + i
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      disabled={loading}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                        pageNum === page ? "bg-amber-500 text-black" : "border border-border bg-card hover:bg-muted"
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
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </main>

        {/* Desktop Sidebar — hidden on mobile */}
        <aside className="hidden lg:block h-fit rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6">
          <SidebarContent />
        </aside>
      </div>

      {/* More Chords Modal — slides up from bottom on mobile, centered on desktop */}
      {isMoreChordsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button aria-label="Close" onClick={() => setIsMoreChordsOpen(false)} className="absolute inset-0 bg-black/70" />
          <div className="relative z-10 flex w-full sm:max-w-5xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-border bg-background" style={{ height: "90dvh" }}>
            <div className="border-b border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">More Chords</p>
                  <p className="mt-1 text-sm text-muted-foreground">Full chord list from your catalog.</p>
                </div>
                <button onClick={() => setIsMoreChordsOpen(false)} className="rounded-lg border border-border bg-card p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="text" value={chordSearch} onChange={(e) => setChordSearch(e.target.value)} placeholder="Search chords..." className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-border bg-card px-2 py-2 text-xs sm:text-sm focus:border-amber-500 focus:outline-none">
                  <option value="all">All Types</option>
                  {availableTypes.map((type) => <option key={type} value={type}>{typeLabel(type)}</option>)}
                </select>
                <select value={slashFilter} onChange={(e) => setSlashFilter(e.target.value as "all" | "only" | "exclude")} className="rounded-lg border border-border bg-card px-2 py-2 text-xs sm:text-sm focus:border-amber-500 focus:outline-none">
                  <option value="all">All Chords</option>
                  <option value="only">Slash Only</option>
                  <option value="exclude">No Slash</option>
                </select>
                <select value={groupMode} onChange={(e) => setGroupMode(e.target.value as "none" | "type" | "root")} className="rounded-lg border border-border bg-card px-2 py-2 text-xs sm:text-sm focus:border-amber-500 focus:outline-none">
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
                <p className="text-sm text-muted-foreground">No chords found.</p>
              ) : groupMode === "none" ? (
                <ChordSelector chords={displayMoreChords} selectedChords={selectedChords} onToggle={toggleChord} columnsClassName="grid-cols-4 sm:grid-cols-5 lg:grid-cols-6" />
              ) : (
                <div className="space-y-5">
                  {groupedMoreChords.map((group) => (
                    <section key={group.groupKey}>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-widest text-amber-500">{groupMode === "type" ? typeLabel(group.groupKey) : group.groupKey}</p>
                        <p className="text-xs text-muted-foreground">{group.chords.length}</p>
                      </div>
                      <ChordSelector chords={group.chords} selectedChords={selectedChords} onToggle={toggleChord} columnsClassName="grid-cols-4 sm:grid-cols-5 lg:grid-cols-6" />
                    </section>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{selectedChords.length} chords selected</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedChords([])} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted">Clear</button>
                  <button onClick={() => setIsMoreChordsOpen(false)} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400">Done</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}