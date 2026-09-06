/**
 * Site-wide configuration.
 * `repoUrl` is the canonical GitHub repository; used for all "read the spec" links.
 */
export const site = {
  name: "PhotoRelay",
  tagline: "Reliable phone → PC photo transfer",
  principle: "Transfers can fail. PhotoRelay makes failure irrelevant.",
  repoUrl: "https://github.com/berkkarabacak/photorelay",
  /**
   * The releases page, deliberately not a direct link to a versioned asset.
   * This was pinned to v0.1.0/PhotoRelay-Setup-0.1.0.exe, which would 404 the
   * day 0.2.0 shipped. Releases here are built by hand with no CI, so anything
   * that depends on a filename staying spelled the same will rot again.
   */
  downloadUrl: "https://github.com/berkkarabacak/photorelay/releases/latest",
  version: "0.1.0",
  protocol: "RelaySync/1",
} as const;

export function docUrl(doc: "architecture" | "transfer-protocol" | "data-model" | "security-model" | "ux-design") {
  return `${site.repoUrl}/blob/main/docs/${doc}.md`;
}
