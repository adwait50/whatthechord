/**
 * Parses raw lyric content with inline chord markers into aligned chord-word pairs.
 * 
 * Example input: "[Bm]Aankhon [Am]Mein [G]Basey Ho Tum"
 * Example output: [
 *   { word: "Aankhon", chord: "Bm" },
 *   { word: "Mein", chord: "Am" },
 *   { word: "Basey", chord: "G" },
 *   { word: "Ho", chord: null },
 *   { word: "Tum", chord: null }
 * ]
 */

export type ChordWord = {
  word: string
  chord: string | null
}

export function parseRawLyrics(rawContent: string): ChordWord[] {
  const result: ChordWord[] = []
  
  // Match pattern: [ChordName]word
  const regex = /(?:\[([A-G][^\]]{0,5})\])?([^\[\]]+)/g
  let match
  
  while ((match = regex.exec(rawContent)) !== null) {
    const chord = match[1] || null
    const text = match[2].trim()
    
    // Split text into words
    const words = text.split(/\s+/).filter(Boolean)
    
    for (let i = 0; i < words.length; i++) {
      result.push({
        word: words[i],
        chord: i === 0 ? chord : null, // Only attach chord to first word
      })
    }
  }
  
  return result
}

/**
 * Converts parsed chord words back to raw format for storage.
 * Takes the data with proper chord alignment and recreates the [Chord]word format.
 */
export function reconstructRawLyrics(words: ChordWord[]): string {
  return words
    .map((item) => {
      if (item.chord) {
        return `[${item.chord}]${item.word}`
      }
      return item.word
    })
    .join(" ")
}
