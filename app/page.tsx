import { Hero } from "@/components/home/hero"
import { HowItWorks } from "@/components/home/how-it-works"
import { TrendingSongs } from "../components/home/trending-songs"
import { CtaBanner } from "@/components/home/cta-banner"

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <TrendingSongs />
      <CtaBanner />
    </>
  )
}