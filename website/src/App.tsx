import { Nav } from "@/sections/Nav";
import { Hero } from "@/sections/Hero";
import { Problem } from "@/sections/Problem";
import { Principle } from "@/sections/Principle";
import { HowItWorks } from "@/sections/HowItWorks";
import { ForFamilies } from "@/sections/ForFamilies";
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
        <Problem />
        <Principle />
        <HowItWorks />
        <ForFamilies />
        <Demo />
        <Architecture />
        <Roadmap />
      </main>
      <Footer />
    </div>
  );
}
