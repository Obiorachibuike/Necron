import { NextRequest, NextResponse } from "next/server";
import {
  PLATFORMS,
  REPOSITORY,
  archFromSlug,
  formatFromQuery,
  platformFromSlug,
} from "@/lib/desktop";
import { pickAsset, type ReleaseAsset } from "@/lib/desktop-release";

/**
 * Resolve a download to the current GitHub Release asset.
 *
 * Buttons point at this route rather than a hard-coded asset URL so a version bump
 * cannot leave a dead link on the marketing site. If no matching asset is published
 * yet, the visitor is sent back to the download page with an explanation instead of
 * to a GitHub 404.
 */
export const dynamic = "force-dynamic";

/** Build an absolute URL using the public host, not the bind address Next.js sees. */
function siteUrl(request: NextRequest, path: string): URL {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto ?? request.nextUrl.protocol.replace(":", "");
  try {
    return new URL(`${proto}://${host}${path}`);
  } catch {
    return new URL(path, request.url);
  }
}

interface GithubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

async function findReleaseAsset(
  platform: NonNullable<ReturnType<typeof platformFromSlug>>,
  arch: NonNullable<ReturnType<typeof archFromSlug>>,
  format: ReturnType<typeof formatFromQuery>
): Promise<{ release: GithubRelease; asset: ReleaseAsset } | null> {
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "careerpilot-website",
  };
  const token = process.env.CP_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}/releases?per_page=20`,
      { headers, next: { revalidate: 1800 } }
    );
    if (!response.ok) return null;
    const releases = (await response.json()) as GithubRelease[];
    if (!Array.isArray(releases)) return null;
    for (const release of releases) {
      if (release.draft || release.prerelease || !Array.isArray(release.assets)) continue;
      const asset = pickAsset(release.assets, platform, arch, format);
      if (asset) return { release, asset };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ platform: string; arch: string }> }
) {
  const { platform: platformSlug, arch: archSlug } = await context.params;
  const platform = platformFromSlug(platformSlug);
  const arch = archFromSlug(archSlug);

  if (!platform || !arch) {
    return NextResponse.redirect(siteUrl(request, "/download?missing=invalid"), 302);
  }

  const format = formatFromQuery(platform, request.nextUrl.searchParams.get("format"));
  const fallback = siteUrl(request, `/download?missing=${platform}`);

  const match = await findReleaseAsset(platform, arch, format);
  if (!match) {
    return NextResponse.redirect(fallback, 302);
  }
  const { release, asset } = match;

  let destination: URL;
  try {
    destination = new URL(asset.browser_download_url);
  } catch {
    return NextResponse.redirect(fallback, 302);
  }
  if (destination.protocol !== "https:" || destination.hostname !== "github.com") {
    return NextResponse.redirect(fallback, 302);
  }

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "public, max-age=300, s-maxage=900");
  response.headers.set("X-CareerPilot-Release", release.tag_name);
  response.headers.set("X-CareerPilot-Platform", `${PLATFORMS[platform].label} ${arch}`);
  return response;
}
