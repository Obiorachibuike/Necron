import { proxyToBackend } from "@/lib/backend-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export {
  proxyToBackend as GET,
  proxyToBackend as POST,
  proxyToBackend as PUT,
  proxyToBackend as PATCH,
  proxyToBackend as DELETE,
  proxyToBackend as HEAD,
  proxyToBackend as OPTIONS,
};
