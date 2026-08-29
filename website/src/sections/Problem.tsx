/** Problem — one giant number, three words. Nothing else to say. */
const pains = ["Disconnects", "Freezes", "Duplicates"];

export function Problem() {
  return (
    <section id="problem" className="mx-auto max-w-6xl px-6 py-24">
      <div className="text-kicker mb-8 flex items-center justify-between">
        <span>Why it exists</span>
        <span>01 / 07</span>
      </div>
      <div className="grid items-end gap-8 lg:grid-cols-[auto_1fr]">
        <div className="font-display text-[9rem] font-bold leading-none text-red-400/90 sm:text-[13rem]">
          70%
        </div>
        <div className="pb-4">
          <h2 className="font-display max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
            Where phone transfers go to die —{" "}
            <em className="text-red-300/90">and nobody can say which photos made it.</em>
          </h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {pains.map((p) => (
              <span
                key={p}
                className="rounded-full border border-red-900/50 bg-red-950/30 px-4 py-1.5 text-sm font-medium text-red-300/90"
              >
                {p}
              </span>
            ))}
            <span className="rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground">
              …met them all? Everyone has.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
