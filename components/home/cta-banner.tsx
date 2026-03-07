"use client"

import { useClerk } from "@clerk/nextjs"
import { ArrowLeft } from "lucide-react"

export function CtaBanner() {
  const { openSignUp } = useClerk()

  return (
    <section className="py-24 px-4 border-t border-border bg-red-700">
      <div className="max-w-7xl mx-auto">
        <div className="bg-card border-l-4 border-l-amber-500 border-y border-r border-border rounded-2xl p-10 flex flex-col md:flex-row items-center justify-between gap-6">

          <div>
            <h2 className="text-3xl font-bold">
              LOOK HERE 
            </h2>
            <p className="mt-2 text-muted-foreground">
              Join this link <div className="text-amber-100">https://meet.google.com/dgm-hbca-bic <br/></div>for 5 mins after the class ends, i wanna talk about classes which i cant here.
            </p>
          </div>

          <button
            onClick={() => openSignUp({})}
            className="shrink-0 bg-red-500 hover:bg-red-400 text-white font-bold px-8 py-3 rounded-xl transition-colors"
          >
            look here<ArrowLeft className="h-3 w-3" />
          </button>

        </div>
      </div>
    </section>
  )
}