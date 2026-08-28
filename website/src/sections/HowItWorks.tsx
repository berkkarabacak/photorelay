const steps = [
  {
    n: "1",
    title: "Install PhotoRelay on the PC — once",
    body: "A one-time setup, done by a family member or anyone comfortable with computers. After that, nobody touches it.",
  },
  {
    n: "2",
    title: "Plug the phone in with its charging cable",
    body: "The same cable used for charging. The very first time, the phone may ask once — tap “Allow” or “Trust.”",
  },
  {
    n: "3",
    title: "It copies everything by itself",
    body: "Every photo and video, checked as it goes. Bump the cable or restart the PC — it simply continues where it stopped. Never a duplicate.",
  },
  {
    n: "4",
    title: "Unplug when it says “All done!”",
    body: "That's the whole routine. New photos are picked up automatically every time the phone is plugged in.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        <p className="mt-3 text-muted-foreground">
          No phone app to install, nothing to configure. The cable is the interface.
        </p>
      </div>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <li key={s.n} className="relative rounded-2xl border border-border bg-card/60 p-6">
            <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-950 font-mono text-sm font-bold text-emerald-300 border border-emerald-800/60">
              {s.n}
            </span>
            <h3 className="mb-1.5 font-semibold">{s.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        If the cable comes loose: <span className="text-amber-300">“The cable came loose — plug it back in.”</span>
        {"  "}→{"  "}
        <span className="text-emerald-300">it continues by itself</span> — automatically, every time.
      </p>
    </section>
  );
}
