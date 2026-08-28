import { useEffect, useRef, useState } from "react";
import { TransferSim, type Snapshot } from "./engine";

/**
 * React binding for the RelaySync/1 demo engine.
 * The engine is UI-agnostic; this hook drives its 10 Hz tick loop
 * and republishes immutable snapshots as React state.
 */
export function useTransferSim() {
  const simRef = useRef<TransferSim | null>(null);
  if (simRef.current === null) {
    simRef.current = new TransferSim();
  }
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const sim = simRef.current!;
    const unsubscribe = sim.subscribe(setSnap);
    let last = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      sim.tick(now - last);
      last = now;
    }, 100);
    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

  return { snap, sim: simRef.current };
}
