import { Music, SlidersHorizontal, Guitar } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: Music,
    title: "Pick your chords",
    description: "Tell us which chords you already know how to play",
  },
  {
    number: "02",
    icon: SlidersHorizontal,
    title: "Filter instantly",
    description: "We show only songs that match your chord knowledge",
  },
  {
    number: "03",
    icon: Guitar,
    title: "Start playing",
    description: "Every result is something you can play right now",
  },
]

export function HowItWorks() {
  return (
    <section className="py-24 px-4">
      <div className="max-w-7xl mx-auto">

        {/* Label */}
        <p className="text-amber-500 text-xs font-semibold uppercase tracking-widest">
          How it works
        </p>

        {/* Heading */}
        <h2 className="mt-3 text-4xl font-bold">
          Three steps to your next song
        </h2>

        {/* Cards */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div
                key={step.number}
                className="bg-card border border-border rounded-2xl p-8 relative overflow-hidden"
              >
                {/* Step number watermark */}
                <span className="absolute top-4 right-6 text-6xl font-bold text-white/[0.05]">
                  {step.number}
                </span>

                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-amber-500" />
                </div>

                {/* Text */}
                <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            )
          })}
        </div>

      </div>
    </section>
  )
}