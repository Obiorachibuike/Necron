import { afterEach, describe, expect, it, vi } from "vitest";

import { backendTarget, proxyToBackend, resolveBackendUrl } from "./backend-proxy";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("backend service resolution", () => {
  it("uses the runtime service binding and removes trailing slashes", () => {
    expect(resolveBackendUrl({ CP_BACKEND_URL: " https://backend.internal/// " }))
      .toBe("https://backend.internal");
  });

  it("keeps a loopback fallback for standalone local development only", () => {
    expect(resolveBackendUrl({ NODE_ENV: "development" })).toBe("http://127.0.0.1:8000");
    expect(resolveBackendUrl({ NODE_ENV: "production" })).toBeNull();
    expect(resolveBackendUrl({ NODE_ENV: "development", VERCEL: "1" })).toBeNull();
  });

  it("preserves the API path, query string, and any base path", () => {
    const target = backendTarget(
      "https://careerpilot.example/api/v1/jobs/abc?include=match#ignored",
      "https://backend.internal/service/",
    );
    expect(target.href).toBe(
      "https://backend.internal/service/api/v1/jobs/abc?include=match",
    );
  });
});

describe("backend proxy", () => {
  it("forwards requests at runtime and preserves response cookies", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("CP_BACKEND_URL", "https://backend.internal/");
    const upstream = new Response(JSON.stringify({ id: "job-1" }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
        "Content-Encoding": "gzip",
        "Set-Cookie": "cp_session=session; Path=/; HttpOnly",
      },
    });
    upstream.headers.append("Set-Cookie", "cp_csrf=csrf; Path=/");
    const fetchMock = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyToBackend(new Request(
      "https://careerpilot.example/api/v1/jobs?notify=true",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "16",
          Cookie: "cp_session=old-session",
          "X-CSRF-Token": "old-csrf",
          Connection: "keep-alive",
        },
        body: JSON.stringify({ title: "Engineer" }),
      },
    ));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0];
    expect(target.href).toBe("https://backend.internal/api/v1/jobs?notify=true");
    expect(init.method).toBe("POST");
    expect(new TextDecoder().decode(init.body)).toBe(JSON.stringify({ title: "Engineer" }));
    const forwarded = new Headers(init.headers);
    expect(forwarded.get("cookie")).toBe("cp_session=old-session");
    expect(forwarded.get("x-csrf-token")).toBe("old-csrf");
    expect(forwarded.get("content-length")).toBeNull();
    expect(forwarded.get("connection")).toBeNull();

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "job-1" });
    expect(response.headers.getSetCookie()).toEqual([
      "cp_session=session; Path=/; HttpOnly",
      "cp_csrf=csrf; Path=/",
    ]);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed without a binding on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("CP_BACKEND_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyToBackend(new Request(
      "https://careerpilot.example/api/v1/health",
    ));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "backend_binding_missing" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a safe error when the internal service cannot be reached", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("CP_BACKEND_URL", "https://backend.internal");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
      new Error("secret internal URL must not leak"),
    ));

    const response = await proxyToBackend(new Request(
      "https://careerpilot.example/api/v1/health",
    ));

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret internal URL");
  });
});
