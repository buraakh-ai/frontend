import "server-only";
import { Agent, fetch as undiciFetch } from "undici";
import type { BackendResult } from "@/lib/backend-result";

// Node's built-in fetch gives up waiting for response headers after 5 min;
// Lead source runs can take up to 20. Timeouts are enforced per call instead.
const longCallAgent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });

// While a slow backend call is pending, write a space every 15 s so the load
// balancer's idle timeout doesn't cut the browser connection. Leading
// whitespace is valid JSON, so the client just parses the whole body.
const HEARTBEAT_MS = 15_000;

async function callBackend(url: string, init: RequestInit, timeoutMs: number): Promise<BackendResult> {
  try {
    const res = await undiciFetch(url, {
      method: init.method,
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
      dispatcher: longCallAgent,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body (e.g. an HTML error page); keep it as text.
    }
    if (!res.ok) {
      const detail =
        data && typeof data === "object" && "detail" in data ? (data as { detail: unknown }).detail : text;
      return { ok: false, error: `${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` };
    }
    return { ok: true, data };
  } catch (err) {
    const e = err as Error;
    const message =
      e.name === "TimeoutError" ? `Backend did not respond within ${Math.round(timeoutMs / 1000)}s` : e.message;
    return { ok: false, error: `Could not reach the backend: ${message}` };
  }
}

/** Calls the backend and streams back a BackendResult envelope, with
 * keep-alive whitespace while waiting. Always HTTP 200; check `ok`. */
export function proxyJson(url: string, init: RequestInit, timeoutMs: number): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(" ")), HEARTBEAT_MS);
      const result = await callBackend(url, init, timeoutMs);
      clearInterval(heartbeat);
      controller.enqueue(encoder.encode(JSON.stringify(result)));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Streams a binary file (e.g. a generated image) straight through. */
export async function proxyFile(url: string, timeoutMs: number): Promise<Response> {
  try {
    const res = await undiciFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return new Response(res.body as ReadableStream, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Backend unreachable", { status: 502 });
  }
}

export const notFound = () => Response.json({ ok: false, error: "Unknown endpoint" }, { status: 404 });
