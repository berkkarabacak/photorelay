/**
 * PhotoRelay tray-app UI.
 *
 * Elderly-first (docs/ux-design.md §0): one screen, one job; giant text;
 * one obvious thing to do — or nothing to do at all.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { TrayState } from "../shared/state";

function useTrayState(): TrayState | null {
  const [state, setState] = useState<TrayState | null>(null);
  useEffect(() => {
    const bridge = window.photorelay;
    if (!bridge) return;
    bridge.getState().then(setState);
    return bridge.onState(setState);
  }, []);
  return state;
}

function QrImage({ payload }: { payload: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(payload, { width: 440, margin: 2, errorCorrectionLevel: "M" }).then(setDataUrl);
  }, [payload]);
  if (!dataUrl) return <div className="h-[440px] w-[440px] rounded-2xl bg-white" />;
  return <img src={dataUrl} alt="Pairing QR code" className="h-[440px] w-[440px] rounded-2xl bg-white p-3" />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-10 py-8 text-center">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
          <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none">
            <path d="M15 22V10m0 0-5 5m5-5 5 5" stroke="#052e22" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-2xl font-bold tracking-tight">PhotoRelay</span>
      </div>
      {children}
    </div>
  );
}

function PlugScreen() {
  return (
    <Shell>
      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-card border border-border">
        <span className="text-6xl">🔌</span>
      </div>
      <h1 className="mb-3 max-w-2xl text-4xl font-bold leading-tight">
        Plug the phone into this computer with its USB cable
      </h1>
      <p className="max-w-lg text-xl leading-relaxed text-mutedfg">
        Use the phone's own charging cable. The very first time, the phone may ask —
        tap <span className="font-semibold text-foreground">“Allow”</span> or{" "}
        <span className="font-semibold text-foreground">“Trust”</span> once. After that, everything
        happens by itself.
      </p>
      <p className="mt-8 animate-pulse-soft text-lg text-mutedfg">Waiting for the phone…</p>
    </Shell>
  );
}

function PairScreen({ state }: { state: TrayState }) {
  return (
    <Shell>
      <h1 className="mb-2 max-w-xl text-4xl font-bold leading-tight">
        Point your phone's camera at this picture
      </h1>
      <p className="mb-6 max-w-md text-xl text-mutedfg">
        The phone and this computer find each other by themselves. Nothing to type.
      </p>
      {state.pairUri ? <QrImage payload={state.pairUri} /> : null}
      {state.sasWords ? (
        <div className="mt-6 rounded-2xl border border-border bg-card px-8 py-5">
          <p className="mb-2 text-xl">Does your phone show these same 6 words?</p>
          <p className="font-mono text-2xl font-bold tracking-wide text-primary">
            {state.sasWords.join(" · ")}
          </p>
        </div>
      ) : (
        <p className="mt-6 text-lg text-mutedfg">Waiting for the phone…</p>
      )}
    </Shell>
  );
}

function ReadyScreen({ state }: { state: TrayState }) {
  return (
    <Shell>
      <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-card border border-border">
        <span className="text-5xl">📱</span>
      </div>
      <h1 className="mb-3 max-w-xl text-4xl font-bold leading-tight">
        All set{state.deviceName ? ` — ${state.deviceName} is connected` : ""}
      </h1>
      <p className="max-w-md text-xl leading-relaxed text-mutedfg">
        Open PhotoRelay on your phone and tap{" "}
        <span className="font-semibold text-foreground">“Copy all my photos”</span>. That's it —
        everything else happens by itself. You can close this window; PhotoRelay keeps working in
        the background.
      </p>
    </Shell>
  );
}

function TransferScreen({ state }: { state: TrayState }) {
  const waiting = state.phase === "waiting";
  const pct = state.bytesTotal > 0 ? Math.round((state.bytesDone / state.bytesTotal) * 100) : 0;
  return (
    <Shell>
      <h1
        className={`mb-2 max-w-2xl text-4xl font-bold leading-tight ${waiting ? "text-amber" : ""}`}
      >
        {waiting ? state.headline : "Copying your photos…"}
      </h1>
      <p className="mb-8 max-w-lg text-xl text-mutedfg">
        {waiting
          ? "Nothing is lost. It will continue by itself the moment the cable is back."
          : "You can close this window — it keeps working even if the cable is bumped."}
      </p>
      <div className="w-full max-w-xl">
        <div className="mb-2 flex items-baseline justify-between text-xl">
          <span className="font-semibold tabular-nums">
            {state.doneItems.toLocaleString("en-US")} of {state.totalItems.toLocaleString("en-US")} photos
          </span>
          <span className="tabular-nums text-mutedfg">{pct}%</span>
        </div>
        <div className="h-6 overflow-hidden rounded-full bg-card border border-border">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${waiting ? "bg-amber" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {state.skipped > 0 && (
          <p className="mt-3 text-lg text-mutedfg">
            {state.skipped.toLocaleString("en-US")} were already backed up — skipped automatically.
          </p>
        )}
      </div>
    </Shell>
  );
}

function DoneScreen({ state }: { state: TrayState }) {
  return (
    <Shell>
      <div className="mb-5 flex h-28 w-28 items-center justify-center rounded-full bg-primary/15 border-2 border-primary">
        <svg viewBox="0 0 32 32" className="h-14 w-14" fill="none">
          <path d="M7 17l6 6L25 9" stroke="#34d399" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="mb-3 max-w-2xl text-4xl font-bold leading-tight">All done!</h1>
      <p className="max-w-lg text-xl leading-relaxed text-mutedfg">{state.headline.replace(/^All done! /, "")}</p>
      <p className="mt-6 max-w-lg text-lg text-mutedfg">
        Your photos are in <span className="font-mono text-base text-foreground">{state.libraryDir}</span>.
        New photos you take will back up automatically whenever your phone is nearby.
      </p>
    </Shell>
  );
}

export default function App() {
  const state = useTrayState();
  if (!state) {
    return (
      <Shell>
        <p className="text-xl text-mutedfg">Starting…</p>
      </Shell>
    );
  }
  switch (state.phase) {
    case "plug":
      return <PlugScreen />;
    case "pairing":
      return <PairScreen state={state} />;
    case "ready":
      return <ReadyScreen state={state} />;
    case "transferring":
    case "waiting":
      return <TransferScreen state={state} />;
    case "done":
      return <DoneScreen state={state} />;
  }
}
