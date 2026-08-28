import { Cable, HardDriveDownload, MousePointerClick, ShieldCheck, Wrench } from "lucide-react";

const steps = [
  {
    icon: Wrench,
    title: "Someone installs it once",
    body: "A family member or friend installs PhotoRelay on the computer. Five minutes, one time, never again.",
  },
  {
    icon: Cable,
    title: "She plugs in the phone's own cable",
    body: "The same cable that charges the phone. That's the entire job — plug it in like charging.",
  },
  {
    icon: HardDriveDownload,
    title: "Everything copies itself",
    body: "Every photo and video lands safely on the computer, checked as it goes. If the cable is bumped, it continues by itself — never starting over, never a duplicate.",
  },
];

export function ForFamilies() {
  return (
    <section id="families" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Made for everyone</h2>
        <p className="mt-3 text-lg text-muted-foreground">
          You don't need to know anything about computers. If you can click a mouse and tap a
          phone screen, you can back up a lifetime of photos.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="rounded-2xl border border-border bg-card/60 p-7">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-950 border border-emerald-800/60">
                <s.icon className="h-6 w-6 text-emerald-300" />
              </span>
              <span className="font-mono text-2xl font-bold text-emerald-500/70">{i + 1}</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold leading-snug">{s.title}</h3>
            <p className="leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-zinc-950/60 p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        <p className="leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Private and free.</span> Photos travel
          directly from the phone to the computer inside your home — never through the internet,
          never to the cloud, never to us. PhotoRelay is free and open source, forever.
        </p>
      </div>
    </section>
  );
}
