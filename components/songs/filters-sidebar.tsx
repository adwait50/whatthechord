import { ChordSelector } from "./chord-selector"

type Chord = {
  id: number
  name: string
}

type Props = {
  allChords: Chord[]
  selectedChords: number[]
  onToggleChord: (id: number) => void
  onApplyFilters: () => void
}

export function FiltersSidebar({ 
  allChords, 
  selectedChords, 
  onToggleChord,
  onApplyFilters 
}: Props) {
  return (
    <aside className="w-72 border-r border-border p-6 overflow-y-auto">
      
      <div className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-500 mb-2">
          Your Chords
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Select chords you know
        </p>

        <ChordSelector
          chords={allChords}
          selectedChords={selectedChords}
          onToggle={onToggleChord}
        />

        {selectedChords.length > 0 && (
          <p className="mt-4 text-xs text-amber-500">
            ✓ {selectedChords.length} chords selected
          </p>
        )}
      </div>

      <button
        onClick={onApplyFilters}
        className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-2 rounded-lg transition-colors"
      >
        Apply Filters
      </button>

    </aside>
  )
}