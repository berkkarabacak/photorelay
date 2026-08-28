import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, digits = 1): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : digits)} ${units[i]}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatDuration(totalSeconds: number): string {
  if (!isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r === 0 ? `${m} min` : `${m} min ${r} sec`;
  const h = Math.floor(m / 60);
  return `${h} hr ${m % 60} min`;
}

export function formatClock(t: number): string {
  const d = new Date(t);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
