import { ArrowLeftRight, ArrowRight, BookOpen, Database, FileCheck, FolderTree, Radio, Smartphone } from "lucide-react";
import { docUrl, site } from "@/config";

function Box({ title, items, className }: { title: string; items: string[]; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-zinc-950/70 p-4 ${className ?? ""}`}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">{title}</div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

const docs = [
  { key: "architecture" as const, label: "Architecture" },
  { key: "transfer-protocol" as const, label: "RelaySync/1 protocol spec" },
  { key: "data-model" as const, label: "Data model" },
  { key: "security-model" as const, label: "Security model" },
  { key: "ux-design" as const, label: "UX design" },
];

export function Architecture() {
  return (
    <section id="architecture" className="border-y border-border/60 bg-zinc-950/50">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-12 max-w-2xl">
          <div className="text-kicker mb-4 flex items-center justify-between">
            <span>Under the hood</span>
            <span>05 / 07</span>
          </div>
          <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            One engine. <em className="text-emerald-300">Every path in.</em>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Cable today, Wi-Fi when you want it — the same journal, the same promises.
          </p>
        </div>

        {/* diagram */}
        <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1.2fr]">
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="h-4 w-4 text-emerald-400" /> Phone — Sender
            </div>
            <div className="grid gap-3">
              <Box title="Sender app (Android · iOS)" items={["Library scanner (MediaStore / PhotoKit)", "Manifest builder — diff vs. last session", "Chunker — 256 KiB streaming reads", "Session client — mDNS, TLS, backoff", "SQLite journal — acked/verified state"]} />
            </div>
          </div>

          <div className="flex flex-row items-center justify-center gap-2 rounded-2xl border border-emerald-800/50 bg-emerald-950/30 px-4 py-3 lg:flex-col lg:px-3">
            <ArrowLeftRight className="h-4 w-4 text-emerald-300" />
            <div className="text-center font-mono text-[11px] leading-relaxed text-emerald-200">
              RelaySync/1
              <br />
              <span className="text-emerald-400/70">TLS 1.3 · LAN</span>
              <br />
              <span className="text-emerald-400/70">mDNS + QR pairing</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Radio className="h-4 w-4 text-emerald-400" /> Windows PC — Receiver
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Box title="Session manager" items={["TLS listener · pairing", "State machine per device", "One active session per device"]} />
              <Box title="Transfer engine" items={["Frame codec (CBOR)", "Chunk writer + chunk map", "Dedup index lookup"]} />
              <Box title="Verifier" items={["Inline xxHash64 per chunk", "Async SHA-256 queue", "Quarantine on failure"]} />
              <Box title="Journal — SQLite (WAL)" items={["Journal-first: write before ack", "Crash-safe chunk maps", "Authoritative state"]} />
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-zinc-950/70 px-4 py-2.5 text-xs text-muted-foreground">
              <FolderTree className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                Media store: <span className="font-mono text-zinc-300">incoming/*.part</span> → verify → atomic rename → library. Partial files are never visible as complete.
              </span>
            </div>
          </div>
        </div>

        {/* spec links */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" /> Full specifications:
          </span>
          {docs.map((d) => (
            <a
              key={d.key}
              href={docUrl(d.key)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-zinc-900/70 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:border-emerald-700 hover:text-emerald-300"
            >
              {d.label} <ArrowRight className="h-3.5 w-3.5" />
            </a>
          ))}
          <a
            href={`${site.repoUrl}/tree/main/relay`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 transition-colors hover:border-emerald-600"
          >
            relay/ — working reference implementation <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-8 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <FileCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            Verification levels: metadata fingerprint → per-chunk xxHash64 → full-file SHA-256 on demand.
          </div>
          <div className="flex items-start gap-2">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            SQLite in WAL mode survives power loss; the journal never claims more than what is durably on disk.
          </div>
          <div className="flex items-start gap-2">
            <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            Transport is pluggable — TCP+TLS today, QUIC or USB tethering later, same frames.
          </div>
        </div>
      </div>
    </section>
  );
}
