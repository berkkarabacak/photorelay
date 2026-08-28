import { CopyX, RotateCcw, ShieldCheck } from "lucide-react";
import { site } from "@/config";

const pillars = [
  {
    icon: RotateCcw,
    title: "Resume everything",
    body: "Every 256 KiB chunk is journaled before it's acknowledged. Disconnect, crash, reboot — the transfer continues at the exact chunk where it stopped. 'Start over' does not exist.",
  },
  {
    icon: ShieldCheck,
    title: "Verify everything",
    body: "Metadata fingerprints, per-chunk xxHash64 during transfer, optional full-file SHA-256 after. A partially transferred file can never be mistaken for a complete one.",
  },
  {
    icon: CopyX,
    title: "Never duplicate",
    body: "A content-aware index knows what's already backed up. Re-running a backup of 3,000 photos transfers only what's new — and never creates a single IMG_0001 (2).jpg.",
  },
];

export function Principle() {
  return (
    <section className="border-y border-border/60 bg-zinc-950/50">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <blockquote className="mx-auto max-w-3xl text-center">
          <p className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
            “Don't build a prettier file copy. Build a{" "}
            <span className="text-emerald-300">fault-tolerant synchronization protocol</span> where
            interrupted connections are expected.”
          </p>
          <footer className="mt-4 text-sm text-muted-foreground">— the {site.name} design principle</footer>
        </blockquote>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-card/60 p-6">
              <p.icon className="mb-3 h-5 w-5 text-emerald-400" />
              <h3 className="mb-1.5 font-semibold">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
