import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const chords = await prisma.chord.findMany({
      orderBy: { name: "asc" }
    })
    return NextResponse.json({ chords })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch chords" },
      { status: 500 }
    )
  }
}