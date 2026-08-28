import { CheckCircle2, CircleDashed, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";

const phases = [
  {
    status: "done" as const,
    title: "Phase 0 — Design",
    items: ["Product architecture", "RelaySync/1 protocol spec", "Data & security models", "UX design & copy deck"],
  },
  {
    status: "done" as const,
    title: "Website + live demo",
    items: ["Product site", "In-browser protocol simulation", "Public documentation"],
  },
  {
    status: "done" as const,
    title: "Phase 1 — Protocol reference implementation",
    items: ["Receiver: journal + transfer engine + verifier", "Reference CLI sender", "Golden vectors · 24 tests green (e2e + crash recovery)"],
  },
  {
    status: "next" as const,
    title: "Phase 1.5 — Windows tray app",
    items: ["Wraps the proven protocol core", "mDNS discovery + QR pairing", "Auto-start + notifications"],
  },
  {
    status: "later" as const,
    title: "Phase 2 / 3 — Android & iOS apps",
    items: ["MediaStore / PhotoKit scanners", "Foreground transfer service", "Validated against relay/ golden vectors"],
  },
];

const meta = {
  done: { icon: CheckCircle2, label: "Complete", cls: "text-emerald-400 border-emerald-800/60 bg-emerald-950/40" },
  next: { icon: CircleDot, label: "Up next", cls: "text-amber-300 border-amber-800/60 bg-amber-950/40" },
  later: { icon: CircleDashed, label: "Planned", cls: "text-zinc-400 border-zinc-700 bg-zinc-900/60" },
};

export function Roadmap() {
  return (
    <section id="roadmap" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Roadmap</h2>
        <p className="mt-3 text-muted-foreground">
          Design first, protocol second, apps third. Each phase ships against the same
          specification — no per-platform improvisation.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {phases.map((p) => {
          const m = meta[p.status];
          return (
            <div key={p.title} className="rounded-2xl border border-border bg-card/60 p-5">
              <span className={cn("mb-3 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", m.cls)}>
                <m.icon className="h-3.5 w-3.5" /> {m.label}
              </span>
              <h3 className="mb-2 text-sm font-semibold">{p.title}</h3>
              <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {p.items.map((i) => (
                  <li key={i}>· {i}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
