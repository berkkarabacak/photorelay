import { Github } from "lucide-react";
import { site } from "@/config";

const links: Array<[string, string]> = [
  ["Problem", "#problem"],
  ["How it works", "#how-it-works"],
  ["Demo", "#demo"],
  ["Architecture", "#architecture"],
  ["Roadmap", "#roadmap"],
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-400">
            <svg viewBox="0 0 32 32" className="h-4 w-4" fill="none">
              <path d="M15 22V10m0 0-5 5m5-5 5 5" stroke="#052e22" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-sm font-bold tracking-tight">{site.name}</span>
          <span className="hidden rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
            {site.protocol}
          </span>
        </a>
        <nav className="hidden items-center gap-6 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
        <a
          href={site.repoUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-zinc-900/70 px-3 py-1.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600"
        >
          <Github className="h-4 w-4" />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </div>
    </header>
  );
}
