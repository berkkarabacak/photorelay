import { Nav } from "@/sections/Nav";
import { Hero } from "@/sections/Hero";
import { StatStrip } from "@/sections/StatStrip";
import { Problem } from "@/sections/Problem";
import { HowItWorks } from "@/sections/HowItWorks";
import { Demo } from "@/sections/Demo";
import { Architecture } from "@/sections/Architecture";
import { Roadmap } from "@/sections/Roadmap";
import { Footer } from "@/sections/Footer";

export default function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <Hero />
        <StatStrip />
        <Problem />
        <HowItWorks />
        <Demo />
        <Architecture />
        <Roadmap />
      </main>
      <Footer />
    </div>
  );
}
