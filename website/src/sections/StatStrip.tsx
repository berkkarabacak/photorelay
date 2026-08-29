/** StatStrip — the "quiet math" band: four numbers, no paragraphs. */
const stats = [
  { n: "0", label: "apps on the phone", sub: "nothing to install, ever" },
  { n: "1", label: "cable to plug in", sub: "the one that charges the phone" },
  { n: "0", label: "times you start over", sub: "bump it, reboot, it continues" },
  { n: "3,000+", label: "photos in one run", sub: "every one checked, none twice" },
];

export function StatStrip() {
  return (
    <section className="border-y border-border/60 bg-zinc-950/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-6 py-14 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="px-2 text-center lg:text-left">
            <div className="font-display text-5xl font-bold text-emerald-300 lg:text-6xl">{s.n}</div>
            <div className="mt-1 text-sm font-semibold tracking-wide">{s.label}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 pb-6 text-kicker">
        <span>The quiet math</span>
        <span>02 / 07</span>
      </div>
    </section>
  );
}
