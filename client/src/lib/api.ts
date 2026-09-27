/**
 * Single entry point for calls to the backend.
 *
 * The browser always talks to `/api/*` on the frontend's own domain; Next.js
 * forwards those requests to the NestJS server (see `rewrites` in
 * next.config.ts). Keeping the API same-origin is what lets the session live in
 * an HttpOnly first-party cookie instead of a token readable by JavaScript.
 */
export const API_URL = "/api";

const LOGIN_PATH = "/login";
const CHANGE_PASSWORD_PATH = "/cuenta/contrasena";

function redirectTo(path: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname === path) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `${path}?next=${next}`;
}

/**
 * `fetch` with the session cookie. When the session is missing or expired it
 * sends the user to the login page; when a temporary password must be changed
 * it sends them to the change-password page.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, { ...init, credentials: "include" });

  const isAuthCall = input.startsWith(`${API_URL}/auth/`);
  if (res.status === 401 && !isAuthCall) {
    redirectTo(LOGIN_PATH);
  } else if (res.status === 403 && !isAuthCall) {
    const body = await res.clone().json().catch(() => null);
    if (typeof body?.message === "string" && body.message.includes("cambiar tu contraseña")) {
      redirectTo(CHANGE_PASSWORD_PATH);
    }
  }
  return res;
}

/** Reads the server's error message (Nest returns `message` as string or string[]). */
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  if (!body) return fallback;
  if (Array.isArray(body.message)) return body.message.join(", ");
  if (typeof body.message === "string") return body.message;
  return fallback;
}
