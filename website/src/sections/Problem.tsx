import { CircleSlash, Copy, HelpCircle, Snowflake, Turtle, Unplug } from "lucide-react";

const pains = [
  {
    icon: Unplug,
    title: "Random disconnects",
    body: "USB/MTP drops the phone mid-transfer for no visible reason. 70% through 3,000 photos, the connection is just… gone.",
  },
  {
    icon: Snowflake,
    title: "Explorer freezes",
    body: "Windows Explorer locks up browsing a DCIM folder with a few thousand files, long before you can even press copy.",
  },
  {
    icon: Turtle,
    title: "Speeds crawl",
    body: "Transfers start at 30 MB/s, then degrade to single digits. Large videos make it worse, not better.",
  },
  {
    icon: CircleSlash,
    title: "Fails halfway",
    body: "A 40 GB transfer dies at hour two. There is no retry, no resume — just a silent stop and a half-filled folder.",
  },
  {
    icon: HelpCircle,
    title: "What even transferred?",
    body: "After a failure, nobody can tell you which of the 3,000 files made it. You compare folders by hand, or give up.",
  },
  {
    icon: Copy,
    title: "Duplicates everywhere",
    body: "Re-running the copy creates IMG_0001 (2).jpg ten thousand times. Your backup becomes a mess you can't trust.",
  },
];

export function Problem() {
  return (
    <section id="problem" className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Phone → PC transfer is broken</h2>
        <p className="mt-3 text-muted-foreground">
          If you've ever moved a large photo library to Windows, you've met at least one of these.
          They aren't user errors — they're the predictable result of stretching a 2008-era file
          copy protocol (MTP) far beyond what it was designed for.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pains.map((p) => (
          <div key={p.title} className="rounded-2xl border border-border bg-card/60 p-5 transition-colors hover:border-zinc-600">
            <p.icon className="mb-3 h-5 w-5 text-red-400/80" />
            <h3 className="mb-1.5 font-semibold">{p.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
