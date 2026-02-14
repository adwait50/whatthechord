import 'dotenv/config'
import puppeteer from "puppeteer"

async function debug() {
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  await page.setRequestInterception(true)
  page.on("request", (req) => {
    const blocked = ["googlesyndication", "googletagmanager", "google-analytics", "adsbygoogle", "doubleclick", "ureka"]
    if (blocked.some(b => req.url().includes(b))) {
      req.abort()
    } else {
      req.continue()
    }
  })

  await page.goto(
    "https://indichords.com/songDetails.jsp?songId=2162&titleExtra=Aankhon-Me-Base-Ho-Tum-Abhijeet-Anu-Malik-Alka-Yagnik",
    { waitUntil: "domcontentloaded", timeout: 30000 }
  )

  await new Promise(r => setTimeout(r, 5000))

  // Check what ctx variable contains
  const ctx = await page.evaluate(() => (window as any).ctx)
  console.log("--- ctx variable ---")
  console.log(ctx)

  // Check full body text to find where chords are
  const bodyText = await page.evaluate(() => document.body.innerText)
  const start = bodyText.indexOf("Aankhon Me Base Ho Tum")
  console.log("\n--- Body text around song ---")
  console.log(bodyText.slice(start, start + 500))

  // Check full body HTML for any chord-like patterns
  const bodyHTML = await page.evaluate(() => document.body.innerHTML)
  // Look for [Bm] or similar chord patterns
  const chordPattern = /\[[A-G][^\]]{0,5}\]/g
  const chordMatches = bodyHTML.match(chordPattern)
  console.log("\n--- Chord patterns found in HTML ---")
  console.log(chordMatches)

  await browser.close()
}

debug()