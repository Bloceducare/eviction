import { jsonOk } from "@/lib/api";
import { clearAuthCookies } from "@/lib/session";

export async function POST() {
  const res = jsonOk({ ok: true });
  clearAuthCookies(res);
  return res;
}
