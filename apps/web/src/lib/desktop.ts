/**
 * Desktop release metadata for the marketing site.
 *
 * Keep `DESKTOP_VERSION` in step with `apps/desktop/package.json`; a Vitest test
 * fails if the two drift, because the download buttons point at versioned assets.
 */
export const DESKTOP_VERSION = "1.0.0";
export const DESKTOP_TAG = `v${DESKTOP_VERSION}`;
export const REPOSITORY = "Obiorachibuike/Necron";
export const REPO_URL = `https://github.com/${REPOSITORY}`;
export const RELEASES_URL = `${REPO_URL}/releases`;
export const RELEASE_URL = `${REPO_URL}/releases/tag/${DESKTOP_TAG}`;
export const ASSET_BASE = `${REPO_URL}/releases/download/${DESKTOP_TAG}`;

export type DesktopPlatform = "windows" | "macos" | "linux";
export type DesktopArch = "x64" | "arm64";
export type DownloadFormat = "installer" | "portable" | "appimage" | "deb" | "dmg" | "zip";

export interface PlatformInfo {
  label: string;
  shortLabel: string;
  requirement: string;
  note: string;
  defaultArch: DesktopArch;
  archLabel: Partial<Record<DesktopArch, string>>;
}

export const PLATFORMS: Record<DesktopPlatform, PlatformInfo> = {
  windows: {
    label: "Windows",
    shortLabel: "Windows 10/11",
    requirement: "Windows 10 or later",
    note: "Per-user installer — no administrator rights required. A portable executable is also available.",
    defaultArch: "x64",
    archLabel: { x64: "Intel / AMD (x64)", arm64: "ARM64 (Snapdragon, Surface)" },
  },
  macos: {
    label: "macOS",
    shortLabel: "macOS 11+",
    requirement: "macOS 11 Big Sur or later",
    note: "Open the DMG and drag CareerPilot into Applications. Builds are not notarized yet, so the first launch needs approval in System Settings → Privacy & Security.",
    defaultArch: "arm64",
    archLabel: { x64: "Intel", arm64: "Apple silicon" },
  },
  linux: {
    label: "Linux",
    shortLabel: "Linux x64",
    requirement: "glibc-based distribution · x64",
    note: "AppImage runs without installation; the .deb package integrates with Debian and Ubuntu menus.",
    defaultArch: "x64",
    archLabel: { x64: "x86_64 / AMD64" },
  },
};

export const PLATFORM_ORDER: DesktopPlatform[] = ["windows", "macos", "linux"];

/**
 * Asset names follow electron-builder's `artifactName` template configured in
 * `apps/desktop/package.json`:
 * `${productName}-${version}-${os}-${arch}.${ext}`.
 */
export function assetName(
  platform: DesktopPlatform,
  arch: DesktopArch,
  format: DownloadFormat = "installer"
): string {
  const version = DESKTOP_VERSION;
  switch (platform) {
    case "windows":
      // electron-builder expands ${os} to "windows" and ${arch} to x64/arm64 for .exe.
      return format === "portable"
        ? `CareerPilot-${version}-portable-${arch}.exe`
        : `CareerPilot-${version}-windows-${arch}.exe`;
    case "macos":
      return format === "zip"
        ? `CareerPilot-${version}-mac-${arch}.zip`
        : `CareerPilot-${version}-mac-${arch}.dmg`;
    case "linux":
      // AppImage and deb use Debian-style architecture names in the artifact macro.
      return format === "deb"
        ? `CareerPilot-${version}-linux-amd64.deb`
        : `CareerPilot-${version}-linux-x86_64.AppImage`;
  }
}

/** Direct GitHub asset URL, used as a fallback when the redirect route is skipped. */
export function assetUrl(
  platform: DesktopPlatform,
  arch: DesktopArch,
  format: DownloadFormat = "installer"
): string {
  return `${ASSET_BASE}/${assetName(platform, arch, format)}`;
}

/**
 * Site-local download link. The route handler resolves the current GitHub release
 * asset so a version bump does not silently break the buttons.
 */
export function downloadHref(
  platform: DesktopPlatform,
  arch: DesktopArch,
  format: DownloadFormat = "installer"
): string {
  const query = format === "installer" ? "" : `?format=${format}`;
  return `/download/${platform}/${arch}${query}`;
}

export function formatLabel(format: DownloadFormat): string {
  switch (format) {
    case "portable":
      return "Portable .exe";
    case "appimage":
      return "AppImage";
    case "deb":
      return "Debian package";
    case "dmg":
      return "Disk image";
    case "zip":
      return "ZIP archive";
    default:
      return "Installer";
  }
}

/** Best-effort platform detection from a user agent; never used for security. */
export function detectPlatform(userAgent: string, platform = ""): DesktopPlatform | null {
  const haystack = `${platform} ${userAgent}`.toLowerCase();
  if (/iphone|ipad|ipod/.test(haystack)) return null;
  if (/android|cros/.test(haystack)) return null;
  if (/windows|win32|win64|winnt/.test(haystack)) return "windows";
  if (/macintosh|macintel|macppc|mac os x|macos|darwin/.test(haystack)) return "macos";
  if (/linux|x11|ubuntu|fedora|debian|arch linux/.test(haystack)) return "linux";
  return null;
}

export function platformFromSlug(value: string): DesktopPlatform | null {
  switch (value.toLowerCase()) {
    case "windows":
    case "win":
      return "windows";
    case "macos":
    case "mac":
    case "osx":
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return null;
  }
}

export function archFromSlug(value: string): DesktopArch | null {
  switch (value.toLowerCase()) {
    case "x64":
    case "x86_64":
    case "amd64":
      return "x64";
    case "arm64":
    case "aarch64":
      return "arm64";
    default:
      return null;
  }
}

export function formatFromQuery(
  platform: DesktopPlatform,
  value: string | null
): DownloadFormat {
  const requested = (value ?? "").toLowerCase();
  if (platform === "windows") return requested === "portable" ? "portable" : "installer";
  if (platform === "macos") return requested === "zip" ? "zip" : "dmg";
  return requested === "deb" ? "deb" : "appimage";
}

/** Candidate file extensions in preference order for a platform. */
export function extensionsFor(platform: DesktopPlatform): string[] {
  switch (platform) {
    case "windows":
      return [".exe"];
    case "macos":
      return [".dmg", ".zip"];
    case "linux":
      return [".appimage", ".deb"];
  }
}
