type Chord = {
  id: number
  name: string
}

type Props = {
  chords: Chord[]
  selectedChords: number[]
  onToggle: (id: number) => void
}

export function ChordSelector({ chords, selectedChords, onToggle }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {chords.map(chord => {
        const isSelected = selectedChords.includes(chord.id)
        return (
          <button
            key={chord.id}
            onClick={() => onToggle(chord.id)}
            className={`
              h-10 rounded-lg font-medium text-sm transition-all
              ${isSelected 
                ? "bg-amber-500 text-black" 
                : "bg-card border border-border text-muted-foreground hover:bg-border"
              }
            `}
          >
            {chord.name}
          </button>
        )
      })}
    </div>
  )
}