/**
 * Site-wide configuration.
 * `repoUrl` is the canonical GitHub repository; used for all "read the spec" links.
 */
export const site = {
  name: "PhotoRelay",
  tagline: "Reliable phone → PC photo transfer",
  principle: "Transfers can fail. PhotoRelay makes failure irrelevant.",
  repoUrl: "https://github.com/berkkarabacak/photorelay",
  protocol: "RelaySync/1",
} as const;

export function docUrl(doc: "architecture" | "transfer-protocol" | "data-model" | "security-model" | "ux-design") {
  return `${site.repoUrl}/blob/main/docs/${doc}.md`;
}
