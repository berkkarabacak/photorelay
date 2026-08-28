/**
 * Shared state contract between the Electron main process (TrayHost) and the
 * renderer UI. Keep this file dependency-free — both sides import it.
 */

export type TrayPhase = "plug" | "pairing" | "ready" | "transferring" | "waiting" | "done";

export interface TrayState {
  phase: TrayPhase;
  /** relaysync://pair?… payload for the QR code (only while pairing) */
  pairUri: string | null;
  /** 6-word SAS to confirm after the phone connects (security-model §3.5) */
  sasWords: string[] | null;
  /** Paired phone's display name, once known */
  deviceName: string | null;
  /** Copy-deck headline for the current phase */
  headline: string;
  doneItems: number;
  totalItems: number;
  bytesDone: number;
  bytesTotal: number;
  skipped: number;
  libraryDir: string;
  receiverFingerprint: string;
}
