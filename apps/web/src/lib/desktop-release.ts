import type { DesktopArch, DesktopPlatform, DownloadFormat } from "@/lib/desktop";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

const ARCH_TOKENS: Record<DesktopArch, string[]> = {
  x64: ["x64", "x86_64", "amd64"],
  arm64: ["arm64", "aarch64"],
};

const PLATFORM_TOKENS: Record<DesktopPlatform, string[]> = {
  windows: ["win", "windows"],
  macos: ["mac", "darwin", "osx", "macos"],
  linux: ["linux"],
};

function extensionMatches(name: string, platform: DesktopPlatform, format: DownloadFormat): boolean {
  const lower = name.toLowerCase();
  if (platform === "windows") {
    // Reject portable/combined builds: the installer is the supported path.
    return lower.endsWith(".exe") && !lower.includes("portable");
  }
  if (platform === "macos") {
    return format === "zip" ? lower.endsWith(".zip") : lower.endsWith(".dmg");
  }
  return format === "deb" ? lower.endsWith(".deb") : lower.endsWith(".appimage");
}

export function scoreAsset(
  asset: ReleaseAsset,
  platform: DesktopPlatform,
  arch: DesktopArch,
  format: DownloadFormat
): number {
  const name = asset.name.toLowerCase();
  if (!extensionMatches(asset.name, platform, format)) return -1;

  const allArchTokens = [...ARCH_TOKENS.x64, ...ARCH_TOKENS.arm64];
  const namesAnArch = allArchTokens.some((token) => name.includes(token));
  const hasArch = ARCH_TOKENS[arch].some((token) => name.includes(token));
  // Never hand an Intel visitor an ARM installer: a missing build is better than a
  // download that cannot execute.
  if (namesAnArch && !hasArch) return -1;

  let score = 0;
  if (PLATFORM_TOKENS[platform].some((token) => name.includes(token))) score += 4;
  if (hasArch) score += 3;
  if (/setup|installer/.test(name)) score += 1;
  if (platform === "linux" && format === "appimage" && name.includes("appimage")) score += 2;
  score += Math.min(2, Math.floor(asset.size / 20_000_000));
  return score;
}

/**
 * Pick the best matching asset from a GitHub release. Returns null when the release
 * has no usable artifact, so the caller can explain the gap instead of 404ing.
 */
export function pickAsset(
  assets: ReleaseAsset[],
  platform: DesktopPlatform,
  arch: DesktopArch,
  format: DownloadFormat
): ReleaseAsset | null {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const ranked = assets
    .map((asset) => ({ asset, score: scoreAsset(asset, platform, arch, format) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  return ranked.length > 0 ? ranked[0].asset : null;
}
