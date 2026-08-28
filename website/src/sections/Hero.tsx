import { useEffect, useState } from "react";
import { ArrowDown, Github, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { site } from "@/config";

/** Cycles through the exact status copy a real transfer produces. */
const SEQUENCE = [
  { text: "Transferring 1,204 of 3,061 items — 4 min left", cls: "text-emerald-300", pct: 39 },
  { text: "Connection lost — waiting for phone…", cls: "text-amber-300", pct: 52 },
  { text: "Connected — resuming transfer…", cls: "text-emerald-300", pct: 52 },
  { text: "Transferring 1,618 of 3,061 items — 3 min left", cls: "text-emerald-300", pct: 67 },
  { text: "Done. 2,847 items backed up and verified.", cls: "text-emerald-400", pct: 100 },
] as const;

function StatusCard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => setI((v) => (v + 1) % SEQUENCE.length), 2600);
    return () => window.clearInterval(iv);
  }, []);
  const step = SEQUENCE[i];
  const waiting = i === 1;

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card/90 p-5 shadow-2xl shadow-emerald-950/40">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-zinc-300">Pixel 8 Pro → This PC</span>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2 py-0.5",
            waiting
              ? "border-amber-800/60 bg-amber-950/40 text-amber-300"
              : "border-emerald-800/60 bg-emerald-950/40 text-emerald-300"
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse-soft", waiting ? "bg-amber-400" : "bg-emerald-400")} />
          {waiting ? "offline" : "paired"}
        </span>
      </div>
      <div className={cn("mb-4 min-h-[2.5rem] text-lg font-semibold leading-snug", step.cls)}>{step.text}</div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-1000"
          style={{ width: `${step.pct}%` }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        {waiting ? "Progress is journaled — nothing is lost" : "Every chunk journaled before it's acknowledged"}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-20 sm:pt-28 lg:grid-cols-2 lg:items-center">
        <div className="animate-fade-up">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-zinc-900/70 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {site.protocol} — an open, fault-tolerant transfer protocol
          </div>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Transfers can fail.
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">
              We make failure irrelevant.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            The easiest way to move every photo and video from your phone to your computer.
            No cables, no folders, nothing to learn — it works all by itself over Wi-Fi.
          </p>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground/80">
            Under the hood: automatic resume, integrity verification, and duplicate detection.
            Disconnect mid-transfer, restart the PC, come back tomorrow — it continues at the
            exact chunk where it stopped. Free and open source, forever.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-emerald-300"
            >
              Try the live demo <ArrowDown className="h-4 w-4" />
            </a>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-zinc-900/70 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-600"
            >
              <Github className="h-4 w-4" /> Read the protocol spec
            </a>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <StatusCard />
        </div>
      </div>
    </section>
  );
}
