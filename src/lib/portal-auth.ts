const DEFAULT_PORTAL_URL =
  "https://free-regina-web3bridge-39707ef5.koyeb.app";

export type PortalUser = {
  id: number;
  email: string;
  role: string;
  account_state: string;
  email_verified: boolean;
  full_name: string | null;
  phone: string | null;
  cohort: string | null;
  programme: string | null;
  track: string | null;
};

export type PortalAuthResult = {
  user: PortalUser;
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
  };
};

export function portalBaseUrl() {
  return (
    process.env.PORTAL_API_URL?.replace(/\/$/, "") || DEFAULT_PORTAL_URL
  );
}

/**
 * Authenticate against the Web3Bridge Student Portal.
 * @see https://free-regina-web3bridge-39707ef5.koyeb.app/docs
 */
export async function loginWithPortal(
  email: string,
  password: string
): Promise<
  | { ok: true; data: PortalAuthResult }
  | { ok: false; status: number; message: string }
> {
  const url = `${portalBaseUrl()}/auth/login`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 502,
      message: "Could not reach the Web3Bridge portal. Try again.",
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const detail =
      body &&
      typeof body === "object" &&
      "detail" in body &&
      typeof (body as { detail: unknown }).detail === "string"
        ? (body as { detail: string }).detail
        : null;
    return {
      ok: false,
      status: res.status === 422 ? 400 : res.status,
      message:
        detail ||
        (res.status === 401 || res.status === 403
          ? "Invalid credentials or account is not active"
          : "Portal login failed"),
    };
  }

  const data = body as PortalAuthResult;
  if (!data?.user?.email || !data?.tokens?.access_token) {
    return { ok: false, status: 502, message: "Unexpected portal response" };
  }

  if (
    data.user.account_state &&
    data.user.account_state.toUpperCase() !== "ACTIVE"
  ) {
    return {
      ok: false,
      status: 403,
      message: `Account is ${data.user.account_state}; only ACTIVE accounts can take the exam`,
    };
  }

  return { ok: true, data };
}
