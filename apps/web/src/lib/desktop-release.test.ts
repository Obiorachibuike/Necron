import { describe, expect, it } from "vitest";
import { pickAsset, scoreAsset, type ReleaseAsset } from "@/lib/desktop-release";

const asset = (name: string, size = 90_000_000): ReleaseAsset => ({
  name,
  size,
  browser_download_url: `https://github.com/Obiorachibuike/Necron/releases/download/v1.0.0/${name}`,
});

const RELEASE_ASSETS = [
  asset("CareerPilot-1.0.0-win-x64.exe"),
  asset("CareerPilot-1.0.0-win-arm64.exe"),
  asset("CareerPilot-1.0.0-win.exe", 200_000_000),
  asset("CareerPilot-1.0.0-mac-x64.dmg"),
  asset("CareerPilot-1.0.0-mac-arm64.dmg"),
  asset("CareerPilot-1.0.0-mac-arm64.zip"),
  asset("CareerPilot-1.0.0-linux-x86_64.AppImage"),
  asset("CareerPilot-1.0.0-linux-amd64.deb"),
  asset("latest.yml"),
  asset("latest-mac.yml"),
  asset("latest-linux.yml"),
  asset("SHA256SUMS.txt"),
];

describe("release asset selection", () => {
  it("picks the per-architecture Windows installer, never the combined exe", () => {
    expect(pickAsset(RELEASE_ASSETS, "windows", "x64", "installer")?.name).toBe(
      "CareerPilot-1.0.0-win-x64.exe"
    );
    expect(pickAsset(RELEASE_ASSETS, "windows", "arm64", "installer")?.name).toBe(
      "CareerPilot-1.0.0-win-arm64.exe"
    );
    // The arch-less combined installer is usable, but a native build is preferred.
    expect(
      pickAsset([asset("CareerPilot-1.0.0-win.exe", 200_000_000)], "windows", "x64", "installer")
        ?.name
    ).toBe("CareerPilot-1.0.0-win.exe");
  });

  it("respects macOS architecture and format", () => {
    expect(pickAsset(RELEASE_ASSETS, "macos", "arm64", "dmg")?.name).toBe(
      "CareerPilot-1.0.0-mac-arm64.dmg"
    );
    expect(pickAsset(RELEASE_ASSETS, "macos", "x64", "dmg")?.name).toBe(
      "CareerPilot-1.0.0-mac-x64.dmg"
    );
    expect(pickAsset(RELEASE_ASSETS, "macos", "arm64", "zip")?.name).toBe(
      "CareerPilot-1.0.0-mac-arm64.zip"
    );
  });

  it("separates AppImage from the Debian package", () => {
    expect(pickAsset(RELEASE_ASSETS, "linux", "x64", "appimage")?.name).toBe(
      "CareerPilot-1.0.0-linux-x86_64.AppImage"
    );
    expect(pickAsset(RELEASE_ASSETS, "linux", "x64", "deb")?.name).toBe(
      "CareerPilot-1.0.0-linux-amd64.deb"
    );
  });

  it("ignores update metadata and checksum files", () => {
    for (const name of ["latest.yml", "latest-mac.yml", "latest-linux.yml", "SHA256SUMS.txt"]) {
      expect(scoreAsset(asset(name), "windows", "x64", "installer")).toBe(-1);
    }
  });

  it("returns null instead of guessing when nothing matches", () => {
    expect(pickAsset([], "windows", "x64", "installer")).toBeNull();
    expect(pickAsset([asset("CareerPilot-1.0.0-linux-x86_64.AppImage")], "windows", "x64", "installer")).toBeNull();
    expect(pickAsset([asset("CareerPilot-1.0.0-win-arm64.exe")], "windows", "x64", "installer")).toBeNull();
  });

  it("prefers a named setup artifact when several match", () => {
    const assets = [
      asset("CareerPilot-1.0.0-win-x64.exe"),
      asset("CareerPilot-Setup-1.0.0-win-x64.exe"),
    ];
    expect(pickAsset(assets, "windows", "x64", "installer")?.name).toBe(
      "CareerPilot-Setup-1.0.0-win-x64.exe"
    );
  });
});
