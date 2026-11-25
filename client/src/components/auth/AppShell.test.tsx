import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import AppShell from "./AppShell";
import { RETRY_SECONDS } from "./AuthProvider";
import { QUIET_MS, SLOW_MS } from "./StartupScreen";

vi.mock("next/navigation", () => ({ usePathname: () => "/panel" }));
vi.mock("@/components/shell/Sidebar", () => ({ default: () => null }));
vi.mock("@/components/shell/Topbar", () => ({ default: () => null }));
vi.mock("@/components/shell/BottomBar", () => ({ default: () => null }));
vi.mock("@/components/feedback/OfflineBanner", () => ({ OfflineBanner: () => null }));

const fetchMock = vi.fn();
const USER = { id: "u1", email: "a@b.es", fullName: "Daniel", role: "SUPER_ADMIN", storeId: null, mustChangePassword: false };
const ok = () => new Response(JSON.stringify({ user: USER }), { status: 200 });

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/panel");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const app = () => render(<AppShell>Contenido del Panel</AppShell>);

describe("AppShell while the session is checked", () => {
  it("shows nothing for a quick answer, then the page", async () => {
    fetchMock.mockResolvedValue(ok());
    app();
    await tick(QUIET_MS / 2);
    expect(screen.getByText("Contenido del Panel")).toBeTruthy();
  });

  it("says it is connecting, and that waking up takes a while, instead of a blank page", async () => {
    let answer: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (answer = r)));
    app();
    await tick(QUIET_MS + 300);
    screen.getByRole("heading", { name: "Conectando con el servidor…" });
    await tick(SLOW_MS);
    screen.getByText(/puede tardar hasta un minuto/);
    await act(async () => answer(ok()));
    expect(screen.getByText("Contenido del Panel")).toBeTruthy();
  });

  it("without an answer keeps the session, retries on its own and lets the user in", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));
    fetchMock.mockResolvedValueOnce(ok());
    app();
    await tick(0);
    screen.getByRole("heading", { name: "No hay conexión con el servidor" });
    expect(window.location.pathname).toBe("/panel");
    await tick(RETRY_SECONDS * 1000);
    // A 502 while the server wakes up is not «logged out».
    screen.getByRole("heading", { name: "No hay conexión con el servidor" });
    await tick(RETRY_SECONDS * 1000);
    expect(screen.getByText("Contenido del Panel")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("«Reintentar ahora» asks again at once", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValueOnce(ok());
    app();
    await tick(0);
    await act(async () => screen.getByRole("button", { name: "Reintentar ahora" }).click());
    expect(screen.getByText("Contenido del Panel")).toBeTruthy();
  });

  it("an ended session goes to the login, coming back to the same page", async () => {
    const location = { pathname: "/panel", search: "", href: "" };
    vi.stubGlobal("location", location);
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    app();
    await tick(0);
    expect(location.href).toBe("/login?next=%2Fpanel");
  });
});
