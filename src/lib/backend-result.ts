/** What /api/ad/*, /api/lead/*, /api/zoho/*, /api/bitrix/* and /api/hub/* return for JSON calls. */
export type BackendResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Client helper: POSTs (or GETs) through this app's proxy and returns the
 * backend's JSON, throwing an Error with the backend's message on failure. */
export async function callApi<T = Record<string, unknown>>(
  module: "ad" | "lead" | "zoho" | "bitrix" | "hub",
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${module}/${path.replace(/^\//, "")}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Network error: ${(err as Error).message}`);
  }
  const text = await res.text();
  let result: BackendResult<T>;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Unexpected response (${res.status})`);
  }
  if (!result.ok) throw new Error(withoutHtml(result.error));
  return result.data;
}

/** Some upstream services (e.g. Zoho) answer with an HTML error page; show
 * what came before it instead of the markup. */
function withoutHtml(message: string): string {
  const start = message.search(/<[a-z!/]/i);
  if (start < 0) return message;
  const before = message.slice(0, start).trim().replace(/[:\s]+$/, "");
  return `${before || "Request failed"} (the service returned an error page with no details)`;
}
