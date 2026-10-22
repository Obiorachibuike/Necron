import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, readCookie } from "./api";

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }) {
  const body = response.jsonBody;
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body ?? ""),
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api client", () => {
  beforeEach(() => {
    document.cookie = "cp_csrf=test-token; path=/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the CSRF header on mutating requests but not on reads", async () => {
    const fetchMock = mockFetch({ jsonBody: { ok: true } });
    await api.get("/jobs");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/jobs", expect.objectContaining({
      method: "GET",
    }));
    const [, getInit] = fetchMock.mock.calls[0];
    expect(new Headers(getInit.headers).get("X-CSRF-Token")).toBeNull();

    await api.post("/jobs", { title: "Engineer" });
    const [, postInit] = fetchMock.mock.calls[1];
    expect(new Headers(postInit.headers).get("X-CSRF-Token")).toBe("test-token");
    expect(postInit.body).toBe(JSON.stringify({ title: "Engineer" }));
  });

  it("surfaces the backend error envelope with its machine-readable code", async () => {
    mockFetch({
      ok: false,
      status: 422,
      jsonBody: {
        error: {
          code: "ai_not_configured",
          message: "No AI provider is configured.",
          details: [{ field: "use_ai", message: "Configure a provider first." }],
        },
      },
    });
    await expect(api.post("/documents/generate", {})).rejects.toMatchObject({
      status: 422,
      code: "ai_not_configured",
      message: "No AI provider is configured.",
      details: [{ field: "use_ai", message: "Configure a provider first." }],
    });
  });

  it("falls back to a safe message when the error body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ "content-type": "text/html" }),
      json: async () => { throw new Error("not json"); },
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.get("/jobs")).rejects.toBeInstanceOf(ApiError);
    await expect(api.get("/jobs")).rejects.toMatchObject({ status: 500 });
  });

  it("maps a missing CSRF cookie to no header instead of an empty one", () => {
    document.cookie = "cp_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    expect(readCookie("cp_csrf")).toBe("");
  });
});
