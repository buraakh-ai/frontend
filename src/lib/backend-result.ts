/** What /api/ad/* and /api/lead/* return for JSON calls. */
export type BackendResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Client helper: POSTs (or GETs) through this app's proxy and returns the
 * backend's JSON, throwing an Error with the backend's message on failure. */
export async function callApi<T = Record<string, unknown>>(
  module: "ad" | "lead",
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
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
