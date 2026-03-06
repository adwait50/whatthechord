import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { ClerkProvider } from "@clerk/nextjs"
import { Providers } from "@/components/providers"
import { Navbar } from "@/components/navbar"
import "./globals.css"

export const metadata: Metadata = {
  title: "WhatTheChord — Play songs you actually know",
  description:
    "Select the chords you know and discover songs you can play right now.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={GeistSans.variable}
        suppressHydrationWarning
      >
        <body suppressHydrationWarning>
          <Providers>
            <Navbar />
            <main className="min-h-screen">
              {children}
            </main>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}