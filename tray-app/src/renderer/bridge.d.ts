import type { TrayState } from "../shared/state";

export interface PhotoRelayBridge {
  getState: () => Promise<TrayState>;
  onState: (cb: (state: TrayState) => void) => () => void;
}

declare global {
  interface Window {
    photorelay?: PhotoRelayBridge;
  }
}

export {};
