import { Camera, MonitorSmartphone, MousePointerClick, ShieldCheck } from "lucide-react";

const steps = [
  {
    icon: MonitorSmartphone,
    title: "Open PhotoRelay on the computer",
    body: "It shows one big picture on the screen. Nothing to type, nothing to set up.",
  },
  {
    icon: Camera,
    title: "Point the phone's camera at it",
    body: "The phone and computer find each other and connect themselves. This happens once — they remember each other forever.",
  },
  {
    icon: MousePointerClick,
    title: "Tap the one big button",
    body: "Every photo and video copies itself over. If the Wi-Fi stops or the computer restarts, it quietly continues by itself. You never have to start over.",
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
