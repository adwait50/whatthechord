"use client"

import { useClerk } from "@clerk/nextjs"

export function CtaBanner() {
  const { openSignUp } = useClerk()

  return (
    <section className="py-24 px-4 border-t border-border">
      <div className="max-w-7xl mx-auto">
        <div className="bg-card border-l-4 border-l-amber-500 border-y border-r border-border rounded-2xl p-10 flex flex-col md:flex-row items-center justify-between gap-6">

          <div>
            <h2 className="text-3xl font-bold">
              Ready to find your songs?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Join free and start filtering by your chords today.
            </p>
          </div>

          <button
            onClick={() => openSignUp({})}
            className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 rounded-xl transition-colors"
          >
            Get Started Free
          </button>

        </div>
      </div>
    </section>
  )
}