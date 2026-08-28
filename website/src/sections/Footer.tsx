import { Github } from "lucide-react";
import { site } from "@/config";

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
        <div>
          <div className="text-sm font-bold">{site.name}</div>
          <div className="mt-1 text-sm text-muted-foreground">{site.principle}</div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>MIT License</span>
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
          >
            <Github className="h-4 w-4" /> Source
          </a>
        </div>
      </div>
    </footer>
  );
}
