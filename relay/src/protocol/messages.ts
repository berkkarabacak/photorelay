/**
 * RelaySync/1 message schemas (transfer-protocol.md §3–§5).
 * Payloads are CBOR on the wire; these are the JSON-equivalent shapes,
 * plus minimal runtime validators for untrusted input.
 */
import { ErrorCodeValue, PROTOCOL_VERSION } from "./constants.js";

export interface HelloMsg {
  protocol: string; // must equal PROTOCOL_VERSION
  session_id: string; // sender remembers it; empty string = first contact
  device_name: string;
  platform: "android" | "ios" | "cli";
  last_ack_checkpoint?: number;
}

export interface HelloAckMsg {
  protocol: string;
  session_id: string;
  state: SessionState;
  max_in_flight: number;
}

export type SessionState =
  | "PAIRED"
  | "MANIFEST_EXCHANGE"
  | "PLANNING"
  | "TRANSFERRING"
  | "VERIFYING"
  | "INTERRUPTED"
  | "PAUSED"
  | "COMPLETE";

export interface ManifestItem {
  file_id: string;
  rel_path: string;
  name: string;
  size: number;
  mtime: number; // unix seconds
  media: "photo" | "video";
  fingerprint: string; // "size:mtime:xxh64(first 1 MiB)"
  hash_sha256: string | null; // optional, may be computed lazily
}

export interface ManifestMsg {
  page: number;
  pages: number;
  selection: "all" | "album" | "range";
  items: ManifestItem[];
}

export type PlanAction = "SEND" | "RESUME" | "SKIP";

export interface PlanItem {
  file_id: string;
  action: PlanAction;
  reason?: "duplicate" | "already_stored";
  chunk_map?: string; // base64 ChunkMap, present for RESUME
  have_bytes?: number;
  stored_as?: string;
}

export interface PlanMsg {
  items: PlanItem[];
}

export interface ChunkAckMsg {
  file_id: string;
  offset: number;
}

export interface FileDoneMsg {
  file_id: string;
  size: number;
}

export interface FileVerifiedMsg {
  file_id: string;
  stored_as: string;
  sha256: string;
}

export interface ErrorMsg {
  code: ErrorCodeValue;
  retryable: boolean;
  message: string;
  file_id?: string;
  offset?: number;
}

export function isManifestItem(x: unknown): x is ManifestItem {
  const o = x as ManifestItem;
  return (
    !!o &&
    typeof o.file_id === "string" &&
    typeof o.rel_path === "string" &&
    typeof o.name === "string" &&
    Number.isSafeInteger(o.size) &&
    o.size >= 0 &&
    typeof o.mtime === "number" &&
    (o.media === "photo" || o.media === "video") &&
    typeof o.fingerprint === "string"
  );
}

export function isHello(x: unknown): x is HelloMsg {
  const o = x as HelloMsg;
  return (
    !!o &&
    o.protocol === PROTOCOL_VERSION &&
    typeof o.session_id === "string" &&
    typeof o.device_name === "string"
  );
}
