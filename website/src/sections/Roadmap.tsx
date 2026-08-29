import { CheckCircle2, CircleDashed, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

const phases = [
  {
    status: "done" as const,
    title: "The engine",
    line: "Protocol, journal, resume — proven by 24+ tests that kill connections mid-flight.",
  },
  {
    status: "done" as const,
    title: "The Windows app",
    line: "Cable in, photos out. Elderly-first UI, e2e-tested against cable bumps.",
  },
  {
    status: "next" as const,
    title: "Real phones & installer",
    line: "Hardware validation on Android + iPhone, one-click install, auto-start.",
  },
  {
    status: "later" as const,
    title: "Wi-Fi companion apps",
    line: "Cable-free backups someday. Optional — never required.",
  },
];

const meta = {
  done: { icon: CheckCircle2, cls: "text-emerald-400 border-emerald-800/60 bg-emerald-950/40", label: "Done" },
  next: { icon: CircleDot, cls: "text-amber-300 border-amber-800/60 bg-amber-950/40", label: "Next" },
  later: { icon: CircleDashed, cls: "text-zinc-400 border-zinc-700 bg-zinc-900/60", label: "Later" },
};

export function Roadmap() {
  return (
    <section id="roadmap" className="mx-auto max-w-6xl px-6 py-24">
      <div className="text-kicker mb-8 flex items-center justify-between">
        <span>Where it's going</span>
        <span>06 / 07</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {phases.map((p) => {
          const m = meta[p.status];
          return (
            <div key={p.title} className="rounded-2xl border border-border bg-card/60 p-6">
              <span className={cn("mb-4 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", m.cls)}>
                <m.icon className="h-3.5 w-3.5" /> {m.label}
              </span>
              <h3 className="font-display mb-1.5 text-xl font-bold">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.line}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
