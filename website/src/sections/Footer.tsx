import { Github } from "lucide-react";
import { site } from "@/config";

export function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-20 text-center">
        <p className="font-display text-5xl font-bold leading-tight sm:text-6xl">
          Plug in.
          <br />
          <em className="text-emerald-300">Walk away.</em>
        </p>
        <p className="text-kicker mt-8">free &amp; open source · your photos never leave the house</p>
        <div className="mt-10 flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <span>MIT License</span>
          <a
            href={site.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
          >
            <Github className="h-4 w-4" /> {site.repoUrl.replace("https://github.com/", "")}
          </a>
        </div>
      </div>
    </footer>
  );
}
