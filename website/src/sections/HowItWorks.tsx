import { Cable, CheckCheck, Wrench } from "lucide-react";

const steps = [
  {
    icon: Wrench,
    n: "01",
    title: "Install once",
    line: "A family member does this part. Five minutes, never again.",
  },
  {
    icon: Cable,
    n: "02",
    title: "Plug in the cable",
    line: "The same one that charges the phone. That is the entire job.",
  },
  {
    icon: CheckCheck,
    n: "03",
    title: "Unplug at “All done!”",
    line: "Every photo checked. Cable bumped? It continued anyway.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-24">
      <div className="text-kicker mb-8 flex items-center justify-between">
        <span>How it works</span>
        <span>03 / 07</span>
      </div>
      <h2 className="font-display mb-14 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
        Three moves.
        <br />
          <em className="text-emerald-300">Zero computer skills.</em>
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="group rounded-2xl border border-border bg-card/60 p-8 transition-colors hover:border-emerald-800/70">
            <div className="mb-8 flex items-start justify-between">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-950 border border-emerald-800/60">
                <s.icon className="h-8 w-8 text-emerald-300" />
              </span>
              <span className="font-display text-5xl font-bold text-zinc-700 transition-colors group-hover:text-emerald-500/60">
                {s.n}
              </span>
            </div>
            <h3 className="mb-2 text-2xl font-bold">{s.title}</h3>
            <p className="leading-relaxed text-muted-foreground">{s.line}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
