import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ASSET_BASE,
  DESKTOP_TAG,
  DESKTOP_VERSION,
  PLATFORMS,
  RELEASES_URL,
  assetName,
  assetUrl,
  detectPlatform,
  downloadHref,
  formatFromQuery,
  platformFromSlug,
  archFromSlug,
} from "@/lib/desktop";

// Vitest runs from apps/web, so the sibling desktop package is one directory up.
const desktopPackage = JSON.parse(
  readFileSync(resolve(process.cwd(), "..", "desktop", "package.json"), "utf8")
);

describe("desktop release metadata", () => {
  it("keeps the site version in step with the desktop package", () => {
    expect(desktopPackage.version).toBe(DESKTOP_VERSION);
    expect(DESKTOP_TAG).toBe(`v${desktopPackage.version}`);
  });

  it("matches electron-builder's artifact names", () => {
    expect(desktopPackage.build.artifactName).toBe(
      "${productName}-${version}-${os}-${arch}.${ext}"
    );
    expect(assetName("windows", "x64")).toBe("CareerPilot-1.0.0-windows-x64.exe");
    expect(assetName("windows", "arm64")).toBe("CareerPilot-1.0.0-windows-arm64.exe");
    expect(assetName("windows", "x64", "portable")).toBe("CareerPilot-1.0.0-portable-x64.exe");
    expect(assetName("macos", "arm64")).toBe("CareerPilot-1.0.0-mac-arm64.dmg");
    expect(assetName("macos", "x64", "zip")).toBe("CareerPilot-1.0.0-mac-x64.zip");
    expect(assetName("linux", "x64")).toBe("CareerPilot-1.0.0-linux-x86_64.AppImage");
    expect(assetName("linux", "x64", "deb")).toBe("CareerPilot-1.0.0-linux-amd64.deb");
    expect(desktopPackage.build.portable.artifactName).toBe(
      "${productName}-${version}-portable-${arch}.${ext}"
    );
  });

  it("points downloads at the redirect route, not a hard-coded asset", () => {
    expect(downloadHref("windows", "x64")).toBe("/download/windows/x64");
    expect(downloadHref("linux", "x64", "deb")).toBe("/download/linux/x64?format=deb");
    expect(downloadHref("macos", "arm64", "zip")).toBe("/download/macos/arm64?format=zip");
  });

  it("can fall back to a direct GitHub asset URL", () => {
    expect(assetUrl("macos", "arm64")).toBe(
      `${ASSET_BASE}/CareerPilot-1.0.0-mac-arm64.dmg`
    );
    expect(ASSET_BASE).toContain("github.com/Obiorachibuike/Necron/releases/download");
    expect(RELEASES_URL).toBe("https://github.com/Obiorachibuike/Necron/releases");
  });

  it("describes only architectures that are published", () => {
    expect(PLATFORMS.linux.archLabel.arm64).toBeUndefined();
    expect(PLATFORMS.macos.defaultArch).toBe("arm64");
    expect(PLATFORMS.windows.defaultArch).toBe("x64");
  });
});

describe("platform detection", () => {
  it("detects desktop user agents", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
      )
    ).toBe("windows");
    expect(
      detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")
    ).toBe("macos");
    expect(
      detectPlatform("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36")
    ).toBe("linux");
    expect(detectPlatform("Mozilla/5.0", "Win32")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0", "MacIntel")).toBe("macos");
    expect(detectPlatform("Mozilla/5.0", "Linux x86_64")).toBe("linux");
  });

  it("does not offer a desktop installer to phones and tablets", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBeNull();
    expect(detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBeNull();
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBeNull();
    expect(detectPlatform("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)")).toBeNull();
    expect(detectPlatform("Some crawler")).toBeNull();
  });
});

describe("download route parameters", () => {
  it("normalises platform slugs", () => {
    expect(platformFromSlug("win")).toBe("windows");
    expect(platformFromSlug("Darwin")).toBe("macos");
    expect(platformFromSlug("linux")).toBe("linux");
    expect(platformFromSlug("solaris")).toBeNull();
  });

  it("normalises architecture slugs", () => {
    expect(archFromSlug("x86_64")).toBe("x64");
    expect(archFromSlug("AMD64")).toBe("x64");
    expect(archFromSlug("aarch64")).toBe("arm64");
    expect(archFromSlug("riscv")).toBeNull();
  });

  it("keeps formats within what the platform ships", () => {
    expect(formatFromQuery("windows", "portable")).toBe("portable");
    expect(formatFromQuery("windows", "deb")).toBe("installer");
    expect(formatFromQuery("macos", "zip")).toBe("zip");
    expect(formatFromQuery("macos", null)).toBe("dmg");
    expect(formatFromQuery("linux", "deb")).toBe("deb");
    expect(formatFromQuery("linux", "exe")).toBe("appimage");
  });
});
