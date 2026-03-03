export type ChordWord = {
  word: string
  chord: string | null
}

export type SongLyricLine = {
  id: number
  lyric: string
  chords: string[]
  chordWords?: ChordWord[] // New: aligned chord-word pairs
  rawContent?: string | null // raw line with chord markers (from scraper)
}

export type SongLyricSection = {
  title: string
  lines: SongLyricLine[]
}

export type RelatedSong = {
  id: number
  title: string
  slug: string
  artist: string
  chords: string[]
}

export type SongDetailViewModel = {
  slug: string
  title: string
  artists: string[]
  breadcrumbs: string[]
  languageLabel: string
  difficultyLabel: string
  yearLabel: string
  usedChords: string[]
  saveCountLabel: string
  lyricSections: SongLyricSection[]
  relatedSongs: RelatedSong[]
  unlockChord: string
  unlockCount: number
}
