import { NextRequest, NextResponse } from "next/server"

const BASE_URL = "https://www.scales-chords.com"
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

function extractChartUrl(html: string): string | null {
  const absMatch = html.match(
    /https:\/\/www\.scales-chords\.com\/generated\/chord-charts\/[a-z0-9\-_.%]+\.png/i
  )
  if (absMatch?.[0]) return absMatch[0]

  const relMatch = html.match(/\/generated\/chord-charts\/[a-z0-9\-_.%]+\.png/i)
  if (relMatch?.[0]) return `${BASE_URL}${relMatch[0]}`

  return null
}

export async function GET(request: NextRequest) {
  const chord = request.nextUrl.searchParams.get("chord")?.trim()
  if (!chord) {
    return NextResponse.json({ error: "Missing chord query param" }, { status: 400 })
  }

  try {
    const pageUrl = `${BASE_URL}/chord/guitar/${encodeURIComponent(chord)}`
    const pageResponse = await fetch(pageUrl, {
      cache: "no-store",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })

    if (!pageResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch chord page (${pageResponse.status})` },
        { status: 502 }
      )
    }

    const html = await pageResponse.text()
    const chartUrl = extractChartUrl(html)
    if (!chartUrl) {
      return NextResponse.json({ error: "No chord chart image found" }, { status: 404 })
    }

    const imageResponse = await fetch(chartUrl, {
      cache: "force-cache",
      headers: {
        "user-agent": USER_AGENT,
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: pageUrl,
      },
    })

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch chart image (${imageResponse.status})` },
        { status: 502 }
      )
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        "content-type": imageResponse.headers.get("content-type") ?? "image/png",
        "cache-control": "public, max-age=86400, s-maxage=86400",
      },
    })
  } catch {
    return NextResponse.json({ error: "Unexpected failure fetching chart image" }, { status: 500 })
  }
}
