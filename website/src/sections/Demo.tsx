import { useEffect, useRef } from "react";
import {
  Activity,
  CheckCheck,
  FileImage,
  FileVideo,
  Play,
  PlugZap,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Skull,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { cn, formatBytes, formatClock, formatCount, formatDuration } from "@/lib/utils";
import { useTransferSim } from "@/demo/useTransferSim";
import { DEVICE_NAME, LIBRARY_ITEMS, DUPLICATE_ITEMS, type LogEntry, type SimFile, type Snapshot } from "@/demo/engine";

/* ------------------------------ helpers ------------------------------ */

function headline(s: Snapshot): string {
  const done = s.filesStored + s.filesSkipped;
  switch (s.state) {
    case "idle":
      return "Ready when you are — press Transfer.";
    case "pairing":
      return "Pairing with this PC…";
    case "manifest":
      return "Comparing libraries — working out what actually needs to go…";
    case "transferring": {
      const remaining = s.bytesTotal - s.bytesVerified;
      const eta = s.speed > 0 ? remaining / s.speed : NaN;
      return `Transferring ${formatCount(done)} of ${formatCount(s.filesTotal)} items — ${formatDuration(eta)} left`;
    }
    case "waiting":
      return "Connection lost — waiting for phone…";
    case "resuming":
      return "Connected — resuming transfer…";
    case "complete":
      return `Done. ${formatCount(s.filesTotal - DUPLICATE_ITEMS)} items backed up and verified.`;
  }
}

const stateColor: Record<Snapshot["state"], string> = {
  idle: "text-zinc-300",
  pairing: "text-amber-300",
  manifest: "text-amber-300",
  transferring: "text-emerald-300",
  waiting: "text-amber-300",
  resuming: "text-emerald-300",
  complete: "text-emerald-400",
};

const logColor: Record<LogEntry["kind"], string> = {
  info: "text-zinc-400",
  proto: "text-sky-400/90",
  ok: "text-emerald-400/90",
  warn: "text-amber-400/90",
  err: "text-red-400/90",
};

function fileChip(f: SimFile): { label: string; cls: string } {
  switch (f.status) {
    case "queued":
      return { label: "queued", cls: "bg-zinc-800 text-zinc-400" };
    case "sending": {
      const pct = Math.floor((f.receivedChunks / f.chunksTotal) * 100);
      return { label: `${pct}%`, cls: "bg-sky-950 text-sky-300 border border-sky-800/60" };
    }
    case "verifying":
      return { label: "verifying", cls: "bg-amber-950 text-amber-300 border border-amber-800/60" };
    case "stored":
      return { label: "verified ✓", cls: "bg-emerald-950 text-emerald-300 border border-emerald-800/60" };
    case "skipped":
      return { label: "already backed up", cls: "bg-zinc-900 text-zinc-500 border border-zinc-800" };
  }
}

/* ------------------------------ components ------------------------------ */

function Sparkline({ history, live }: { history: number[]; live: boolean }) {
  const w = 220;
  const h = 48;
  const pts = history
    .map((v, i) => `${((i / Math.max(1, history.length - 1)) * w).toFixed(1)},${(h - v * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  return (
    <div className="rounded-xl border border-border bg-zinc-950/60 p-3">
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" /> Throughput
        </span>
        <span className={cn("normal-case", live ? "text-emerald-400" : "text-zinc-500")}>{live ? "live" : "—"}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <polyline points={pts} fill="none" stroke="hsl(158 64% 52%)" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-zinc-950/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function DemoButton(props: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  children: React.ReactNode;
  title?: string;
}) {
  const { variant = "ghost" } = props;
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-35",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-emerald-300",
        variant === "ghost" && "border border-border bg-zinc-900/70 text-zinc-200 hover:border-zinc-600",
        variant === "danger" && "border border-red-900/70 bg-red-950/50 text-red-300 hover:border-red-700"
      )}
    >
      {props.children}
    </button>
  );
}

/* ------------------------------ main section ------------------------------ */

export function Demo() {
  const { snap, sim } = useTransferSim();
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [snap?.log.length]);

  if (!snap) return null;

  const transferring = snap.state === "transferring";
  const waiting = snap.state === "waiting";
  const running = transferring || snap.state === "resuming";
  const progress = snap.bytesTotal > 0 ? snap.bytesVerified / snap.bytesTotal : 0;

  return (
    <section id="demo" className="relative mx-auto max-w-6xl px-6 py-24">
      <div className="mb-10 max-w-2xl">
        <div className="text-kicker mb-4 flex items-center justify-between">
          <span>The live engine — running in your browser</span>
          <span>04 / 07</span>
        </div>
        <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Break it. <em className="text-emerald-300">We dare you.</em>
        </h2>
        <p className="mt-3 text-muted-foreground">
          A working model of the real engine at ~8× speed. Kill the connection. Crash the receiver.
          It resumes at the exact chunk.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ------------------------- transfer console ------------------------- */}
        <div className="rounded-2xl border border-border bg-card/80 p-5 lg:col-span-3">
          {/* device row */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800">
                <Smartphone className="h-5 w-5 text-zinc-300" />
              </div>
              <div>
                <div className="text-sm font-semibold">{DEVICE_NAME}</div>
                <div className="text-xs text-muted-foreground">
                  {formatCount(LIBRARY_ITEMS)} items · {formatBytes(snap.bytesTotal + snap.skippedBytes)} library
                </div>
              </div>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                waiting
                  ? "border-amber-800/60 bg-amber-950/40 text-amber-300"
                  : "border-emerald-800/60 bg-emerald-950/40 text-emerald-300"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", waiting ? "bg-amber-400" : "bg-emerald-400", running || waiting ? "animate-pulse-soft" : "")} />
              {waiting ? "disconnected" : "connected · TLS 1.3"}
            </div>
          </div>

          {/* headline state — the exact copy from the UX spec */}
          <div className={cn("mb-4 min-h-[3.5rem] text-xl font-semibold leading-snug sm:text-2xl", stateColor[snap.state])}>
            {headline(snap)}
          </div>

          {/* progress */}
          <div className="mb-1 flex items-baseline justify-between text-xs text-muted-foreground">
            <span>
              {formatBytes(snap.bytesVerified)} of {formatBytes(snap.bytesTotal)} verified
            </span>
            <span className="tabular-nums">{(progress * 100).toFixed(1)}%</span>
          </div>
          <div className="mb-5 h-2.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-200"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          {/* stats */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Speed" value={transferring ? `${formatBytes(snap.speed, 0)}/s` : "—"} sub="simulated ~8× Wi-Fi" />
            <Stat label="Skipped duplicates" value={formatCount(snap.filesSkipped)} sub="never re-sent" />
            <Stat label="Chunk retries" value={formatCount(snap.retries)} sub="corrupt chunks re-sent" />
            <Stat label="Reconnects" value={formatCount(snap.reconnects)} sub="zero data re-transferred" />
          </div>

          {/* controls */}
          <div className="mb-6 flex flex-wrap gap-2">
            <DemoButton variant="primary" onClick={() => sim.start()} disabled={snap.state !== "idle"}>
              <Play className="h-4 w-4" /> Transfer
            </DemoButton>
            <DemoButton variant="danger" onClick={() => sim.disconnect()} disabled={!transferring && snap.state !== "resuming"}>
              <WifiOff className="h-4 w-4" /> Simulate disconnect
            </DemoButton>
            <DemoButton onClick={() => sim.reconnect()} disabled={!waiting}>
              <PlugZap className="h-4 w-4" /> Reconnect phone
            </DemoButton>
            <DemoButton onClick={() => sim.crashReceiver()} disabled={!running && !waiting} title="Restart the PC app mid-transfer">
              <Skull className="h-4 w-4" /> Crash the receiver
            </DemoButton>
            <DemoButton onClick={() => sim.toggleChaos()}>
              <RefreshCw className={cn("h-4 w-4", snap.chaos && "animate-spin")} />
              {snap.chaos ? "Chaos: on" : "Chaos mode"}
            </DemoButton>
            <DemoButton onClick={() => sim.reset()} disabled={snap.state === "idle"}>
              <RotateCcw className="h-4 w-4" /> Reset
            </DemoButton>
          </div>

          {/* file window */}
          <div className="rounded-xl border border-border bg-zinc-950/60">
            <div className="border-b border-border px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Files — live window
            </div>
            <ul className="divide-y divide-zinc-800/70">
              {snap.recentFiles.map((f) => {
                const chip = fileChip(f);
                return (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    {f.media === "photo" ? (
                      <FileImage className="h-4 w-4 shrink-0 text-zinc-500" />
                    ) : (
                      <FileVideo className="h-4 w-4 shrink-0 text-zinc-500" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">{f.name}</span>
                    <span className="hidden w-16 text-right text-xs tabular-nums text-muted-foreground sm:block">
                      {formatBytes(f.size)}
                    </span>
                    <span className={cn("w-28 rounded-md px-2 py-0.5 text-center text-[11px] font-medium", chip.cls)}>
                      {chip.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ------------------------- protocol log ------------------------- */}
        <div className="flex flex-col rounded-2xl border border-border bg-card/80 p-5 lg:col-span-2">
          <Sparkline history={snap.history} live={transferring} />
          <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-zinc-950/60">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Protocol log — RelaySync/1</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{formatDuration(snap.elapsedSec)} elapsed</span>
            </div>
            <div ref={logRef} className="slim-scroll h-[26rem] overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
              {snap.log.map((entry) => (
                <div key={entry.id} className="flex gap-2">
                  <span className="shrink-0 text-zinc-600">{formatClock(entry.t)}</span>
                  <span className={logColor[entry.kind]}>{entry.msg}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2 rounded-xl border border-border bg-zinc-950/60 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              Every chunk is journaled before it's acknowledged. Verified data is never re-sent.
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-border bg-zinc-950/60 p-3 text-xs text-muted-foreground">
              <CheckCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              Partial files live in a staging area and are promoted atomically after verification.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
