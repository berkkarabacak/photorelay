import { ArrowDown, Github } from "lucide-react";
import { site } from "@/config";
import { CableVisual } from "@/sections/CableVisual";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="animate-fade-up">
          <div className="text-kicker mb-6 flex items-center gap-3">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            PhotoRelay · backup without thinking · N°01
          </div>
          <h1 className="font-display text-6xl font-bold leading-[0.98] sm:text-7xl lg:text-8xl">
            Plug in
            <br />
            the cable.
            <br />
            <em className="text-emerald-300">It does the rest.</em>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
            Every photo and video, from phone to computer — checked, resumed, never duplicated.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-emerald-300"
            >
              Watch it survive a bad cable <ArrowDown className="h-4 w-4" />
            </a>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-zinc-900/70 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-600"
            >
              <Github className="h-4 w-4" /> Source
            </a>
          </div>
          <div className="text-kicker mt-10">free &amp; open source · no account · no cloud</div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <CableVisual />
        </div>
      </div>
    </section>
  );
}
