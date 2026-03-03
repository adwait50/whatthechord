import { notFound } from "next/navigation"

import { prisma } from "@/lib/prisma"
import { parseRawLyrics } from "@/lib/chord-parser"
import { SongDetailClient } from "@/components/songs/song-detail-client"
import type { RelatedSong, SongDetailViewModel, SongLyricLine, SongLyricSection } from "@/components/songs/song-detail-types"

const SECTION_MARKER = /^(verse|chorus|bridge|intro|outro|hook|pre-chorus|refrain)\s*\d*\s*:?$/i
const UNLOCK_CHORD_CANDIDATES = ["F", "Bm", "Bb", "B7", "F#m", "E7"]

function formatArtistName(input: string): string {
  const raw = input.trim()
  if (!raw) {
    return "Unknown Artist"
  }

  // Convert "Last, First" style names into "First Last".
  const reordered = raw.includes(",")
    ? raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : [raw]

  const display =
    reordered.length > 1
      ? `${reordered.slice(1).join(" ")} ${reordered[0]}`
      : reordered[0]

  return display.replace(/\s+/g, " ")
}

function formatLabel(input: string | null | undefined): string {
  if (!input) {
    return "Unknown"
  }

  const normalized = input.trim()
  if (!normalized) {
    return "Unknown"
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function difficultyFromChordCount(chordCount: number): string {
  if (chordCount <= 4) {
    return "Beginner"
  }

  if (chordCount <= 7) {
    return "Intermediate"
  }

  return "Advanced"
}

function splitChordText(chordText: string | null): string[] {
  if (!chordText) {
    return []
  }

  return chordText
    .split(/[\s,|/]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function chunkLines(lines: SongLyricLine[], size: number): SongLyricSection[] {
  const sections: SongLyricSection[] = []

  for (let i = 0; i < lines.length; i += size) {
    sections.push({
      title: `VERSE ${Math.floor(i / size) + 1}`,
      lines: lines.slice(i, i + size),
    })
  }

  return sections
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function shouldMergeFragments(current: SongLyricLine, next: SongLyricLine): boolean {
  if (SECTION_MARKER.test(next.lyric) || next.lyric.length === 0) {
    return false
  }

  const currentWords = countWords(current.lyric)
  const nextWords = countWords(next.lyric)

  if (currentWords === 0 || nextWords === 0) {
    return false
  }

  if (/[.!?;:]$/.test(current.lyric)) {
    return false
  }

  if (currentWords >= 6) {
    return false
  }

  // Most scraped rows are short chord-segments; combine them into one playable lyric line.
  if ((currentWords >= 2 && currentWords <= 4 && nextWords <= 2) || (currentWords <= 2 && nextWords <= 3)) {
    return true
  }

  if (current.chords.length === 1 && next.chords.length === 1 && currentWords + nextWords <= 5) {
    return true
  }

  return false
}

function mergeLyricFragments(lines: SongLyricLine[]): SongLyricLine[] {
  const merged: SongLyricLine[] = []
  let buffer: SongLyricLine | null = null

  for (const line of lines) {
    if (SECTION_MARKER.test(line.lyric)) {
      if (buffer) {
        merged.push(buffer)
        buffer = null
      }
      merged.push(line)
      continue
    }

    if (!buffer) {
      buffer = { ...line }
      continue
    }

    if (shouldMergeFragments(buffer, line)) {
      buffer = {
        id: buffer.id,
        lyric: `${buffer.lyric} ${line.lyric}`.replace(/\s+/g, " ").trim(),
        chords: [...buffer.chords, ...line.chords],
        chordWords: buffer.chordWords && line.chordWords ? [...buffer.chordWords, ...line.chordWords] : buffer.chordWords || line.chordWords,
        rawContent:
          buffer.rawContent && line.rawContent
            ? `${buffer.rawContent} ${line.rawContent}`
            : buffer.rawContent || line.rawContent,
      }
      continue
    }

    merged.push(buffer)
    buffer = { ...line }
  }

  if (buffer) {
    merged.push(buffer)
  }

  return merged
}

function buildLyricSections(lines: { id: number; lyric: string; chord: string | null; rawContent?: string | null }[]): SongLyricSection[] {
  const cleaned = lines
    .map((line) => ({
      id: line.id,
      lyric: line.lyric,
      chords: splitChordText(line.chord),
      chordWords: line.rawContent ? parseRawLyrics(line.rawContent) : undefined,
      rawContent: line.rawContent || undefined,
    }))

  // if we have rawContent on any line, preserve formatting exactly
  if (cleaned.some((l) => l.rawContent)) {
    const sections: SongLyricSection[] = []
    let currentTitle = "VERSE 1"
    let currentLines: SongLyricLine[] = []

    for (const line of cleaned) {
      if (SECTION_MARKER.test(line.lyric)) {
        if (currentLines.length > 0) {
          sections.push({ title: currentTitle, lines: currentLines })
        }
        currentTitle = line.lyric.toUpperCase().replace(/:$/, "")
        currentLines = []
        continue
      }
      currentLines.push(line)
    }

    if (currentLines.length > 0) {
      sections.push({ title: currentTitle, lines: currentLines })
    }

    return sections
  }

  // fallback original behaviour
  const filtered = cleaned.filter((line) => line.lyric.trim().length > 0)
  const reconstructed = mergeLyricFragments(filtered)

  if (reconstructed.length === 0) {
    return [
      {
        title: "VERSE 1",
        lines: [{ id: 0, lyric: "Lyrics not available yet.", chords: [] }],
      },
    ]
  }

  const explicitSections: SongLyricSection[] = []
  let hasExplicitMarkers = false
  let currentTitleFallback = "VERSE 1"
  let currentLinesFallback: SongLyricLine[] = []

  for (const line of reconstructed) {
    if (SECTION_MARKER.test(line.lyric)) {
      hasExplicitMarkers = true
      if (currentLinesFallback.length > 0) {
        explicitSections.push({ title: currentTitleFallback, lines: currentLinesFallback })
      }
      currentTitleFallback = line.lyric.toUpperCase().replace(/:$/, "")
      currentLinesFallback = []
      continue
    }

    currentLinesFallback.push(line)
  }

  if (currentLinesFallback.length > 0) {
    explicitSections.push({ title: currentTitleFallback, lines: currentLinesFallback })
  }

  if (hasExplicitMarkers && explicitSections.length > 0) {
    return explicitSections
  }

  return chunkLines(reconstructed.filter((line) => !SECTION_MARKER.test(line.lyric)), 6)
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

export default async function SongDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const song = await prisma.song.findUnique({
    where: { slug },
    include: {
      artists: {
        include: { artist: true },
        orderBy: { position: "asc" },
      },
      chords: { include: { chord: true } },
      lyrics: { orderBy: { lineIndex: "asc" } },
    },
  })

  if (!song) {
    notFound()
  }

  const usedChords = Array.from(new Set(song.chords.map((item) => item.chord.name))).slice(0, 8)
  // artists already ordered by position
  const artistNames = song.artists.map((item) => formatArtistName(item.artist.name))
  const primaryArtist = artistNames[0] ?? "Unknown Artist"
  const artistIds = song.artists.map((item) => item.artistId)

  const relatedByArtist = artistIds.length
    ? await prisma.song.findMany({
        where: {
          id: { not: song.id },
          artists: { some: { artistId: { in: artistIds } } },
        },
        include: {
          artists: { include: { artist: true } },
          chords: { include: { chord: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 2,
      })
    : []

  const fallbackRelated = relatedByArtist.length < 2
    ? await prisma.song.findMany({
        where: {
          id: { notIn: [song.id, ...relatedByArtist.map((item) => item.id)] },
          chords: { some: { chordId: { in: song.chords.map((item) => item.chordId) } } },
        },
        include: {
          artists: { include: { artist: true } },
          chords: { include: { chord: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 2 - relatedByArtist.length,
      })
    : []

  const relatedSongs: RelatedSong[] = [...relatedByArtist, ...fallbackRelated].map((item) => ({
    id: item.id,
    title: item.title,
    slug: item.slug,
    artist: formatArtistName(item.artists[0]?.artist.name ?? "Unknown Artist"),
    chords: item.chords.map((chord) => chord.chord.name).slice(0, 4),
  }))

  const unlockChord =
    UNLOCK_CHORD_CANDIDATES.find(
      (candidate) => !usedChords.some((chord) => chord.toLowerCase() === candidate.toLowerCase()),
    ) ?? "F"

  const unlockCount = await prisma.song.count({
    where: {
      chords: {
        some: {
          chord: {
            name: unlockChord,
          },
        },
      },
    },
  })

  const lyricSections = buildLyricSections(song.lyrics)
  const saveCountEstimate = 1900 + song.id * 17

  const pageData: SongDetailViewModel = {
    slug: song.slug,
    title: song.title,
    artists: artistNames,
    breadcrumbs: ["Browse", formatLabel(song.language), primaryArtist],
    languageLabel: formatLabel(song.language),
    difficultyLabel: difficultyFromChordCount(usedChords.length),
    yearLabel: song.decade ?? "Unknown",
    usedChords,
    saveCountLabel: `${compactNumber(saveCountEstimate)} people saved this`,
    lyricSections,
    relatedSongs,
    unlockChord,
    unlockCount,
  }

  return <SongDetailClient data={pageData} />
}
