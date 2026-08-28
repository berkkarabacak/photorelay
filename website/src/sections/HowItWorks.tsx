const steps = [
  {
    n: "1",
    title: "Install the PC app",
    body: "A small Windows tray app. It shows a QR code and otherwise stays out of the way.",
  },
  {
    n: "2",
    title: "Open the phone app",
    body: "Android or iOS. The first screen is the camera, ready to scan. No account, no wizard.",
  },
  {
    n: "3",
    title: "Scan to pair",
    body: "The QR carries the PC's key and address. Both screens show the same 6 words — tap confirm. Paired forever.",
  },
  {
    n: "4",
    title: "Choose what to back up",
    body: "Pick albums or date ranges — or just “Back up everything.”",
  },
  {
    n: "5",
    title: "Press Transfer",
    body: "The apps exchange a manifest, skip what's already backed up, and stream the rest over encrypted Wi-Fi.",
  },
  {
    n: "6",
    title: "Walk away",
    body: "Lid closed, phone in your pocket, Wi-Fi down — it waits, reconnects, and resumes by itself until it's done.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        <p className="mt-3 text-muted-foreground">
          The whole product in six steps. You will never see the words MTP, driver, DCIM, or
          checksum — those are our job, not yours.
        </p>
      </div>
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        If the connection disappears: <span className="text-amber-300">“Connection lost — waiting for phone…”</span>
        {"  "}→{"  "}
        <span className="text-emerald-300">“Connected — resuming transfer…”</span> — automatically, every time.
      </p>
    </section>
  );
}
