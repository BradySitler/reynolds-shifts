import { redirect } from "next/navigation";

/** Redirects back to a page with a success or error message in the URL. */
export function done(path: string, msg: string): never {
  redirect(withParam(path, "msg", msg));
}
export function fail(path: string, error: string): never {
  redirect(withParam(path, "error", error));
}
function withParam(path: string, key: string, value: string) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("msg");
  params.delete("error");
  params.set(key, value);
  return `${base}?${params.toString()}`;
}

export type Flash = { msg?: string; error?: string };
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
