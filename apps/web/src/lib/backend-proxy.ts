const LOCAL_BACKEND_URL = "http://127.0.0.1:8000";

const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

type BackendEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  "CP_BACKEND_URL" | "NODE_ENV" | "VERCEL"
>>;

/** Resolve at request time: Vercel service bindings are unavailable during builds. */
export function resolveBackendUrl(env: BackendEnvironment = process.env): string | null {
  const configured = env.CP_BACKEND_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // Plain `next dev` remains convenient without Vercel CLI. Deployed services must
  // use the binding rather than silently attempting to reach their own loopback.
  if (env.VERCEL || env.NODE_ENV === "production") return null;
  return LOCAL_BACKEND_URL;
}

export function backendTarget(requestUrl: string, backendUrl: string): URL {
  const incoming = new URL(requestUrl);
  const target = new URL(backendUrl);
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("The backend URL must use HTTP or HTTPS.");
  }

  const basePath = target.pathname.replace(/\/+$/, "");
  target.pathname = `${basePath}${incoming.pathname}`;
  target.search = incoming.search;
  target.hash = "";
  return target;
}

function unavailable(code: string, message: string): Response {
  return Response.json(
    { error: { code, message, details: [] } },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function upstreamHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  for (const name of [...HOP_BY_HOP_HEADERS, "host", "content-length"]) {
    headers.delete(name);
  }
  return headers;
}

function browserHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  for (const name of [
    ...HOP_BY_HOP_HEADERS,
    "content-encoding",
    "content-length",
    "set-cookie",
  ]) {
    headers.delete(name);
  }

  // Preserve multiple session/CSRF cookies as separate Set-Cookie fields.
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  headers.set("cache-control", "no-store");
  return headers;
}

export async function proxyToBackend(request: Request): Promise<Response> {
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) {
    return unavailable(
      "backend_binding_missing",
      "The API service binding is not configured. Please try again later.",
    );
  }

  try {
    const method = request.method.toUpperCase();
    const body = ["GET", "HEAD"].includes(method)
      ? undefined
      : await request.arrayBuffer();
    const upstream = await fetch(backendTarget(request.url, backendUrl), {
      method,
      headers: upstreamHeaders(request),
      body,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: browserHeaders(upstream),
    });
  } catch {
    // Do not expose the deployment's private binding URL through an error message.
    return unavailable(
      "backend_unavailable",
      "The API service is temporarily unavailable. Please try again later.",
    );
  }
}
