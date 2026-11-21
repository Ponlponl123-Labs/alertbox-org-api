const TOKEN_VALUE_RE = /^[a-zA-Z0-9_.-]+$/;

export function isBearerToken(auth: string): string | false {
  if (!auth || typeof auth !== "string") return false;
  const parts = auth.trim().split(/\s+/);
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) {
    return parts[1];
  }
  return false;
}

export function extractCookieToken(
  cookieHeader: string | null | undefined,
  name = "USRSS",
): string | false {
  if (!cookieHeader || typeof cookieHeader !== "string") return false;
  const parts = cookieHeader.split(";");
  const prefix = `${name}=`;
  for (let i = 0; i < parts.length; i++) {
    const trimmed = parts[i].trim();
    if (!trimmed.startsWith(prefix)) continue;
    const raw = trimmed.slice(prefix.length).trim();
    if (!raw) return false;
    try {
      const decoded = decodeURIComponent(raw);
      return TOKEN_VALUE_RE.test(decoded) ? decoded : false;
    } catch {
      return TOKEN_VALUE_RE.test(raw) ? raw : false;
    }
  }
  return false;
}

export function extractRequestTokenWithSource(
  headers: Record<string, string | undefined>,
  cookie?: Record<string, any>,
): { token: string | false; source: "bearer" | "cookie" | null } {
  const authHeader = headers?.authorization || headers?.Authorization;
  if (authHeader) {
    const bearer = isBearerToken(authHeader);
    if (bearer) return { token: bearer, source: "bearer" };
  }

  const elysiaCookie = cookie?.USRSS?.value;
  if (typeof elysiaCookie === "string" && TOKEN_VALUE_RE.test(elysiaCookie)) {
    return { token: elysiaCookie, source: "cookie" };
  }

  const rawCookie = headers?.cookie || headers?.Cookie;
  const fromHeader = extractCookieToken(rawCookie, "USRSS");
  if (fromHeader) return { token: fromHeader, source: "cookie" };

  return { token: false, source: null };
}

export function extractRequestToken(
  headers: Record<string, string | undefined>,
  cookie?: Record<string, any>,
): string | false {
  return extractRequestTokenWithSource(headers, cookie).token;
}

export function buildSessionCookieHeader(token: string, clear = false): string {
  const isProd = process.env.NODE_ENV === "production";
  const configuredDomain = process.env.COOKIE_DOMAIN;
  const domain = configuredDomain !== undefined ? configuredDomain.trim() : (isProd ? ".alertbox.org" : "");
  const maxAge = clear ? 0 : 172800;
  const value = clear ? "" : encodeURIComponent(token);

  let header = `USRSS=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  if (isProd) header += "; Secure";
  if (domain) header += `; Domain=${domain}`;
  return header;
}
