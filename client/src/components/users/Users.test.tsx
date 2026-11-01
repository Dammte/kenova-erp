import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { UsersPage } from "./UsersPage";
import { lastAccess, statusOf, suggestUsername, temporaryPassword, validateNewUser, type UserRow } from "./users";

let role: "SUPER_ADMIN" | "STORE_ADMIN" = "SUPER_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "me", role, storeId: null } }) }));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const user = (id: string, fullName: string, extra: Partial<UserRow> = {}): UserRow => ({
  id,
  username: fullName.split(" ")[0]!.toLowerCase(),
  fullName,
  email: `${id}@kenova.es`,
  role: "STORE_ADMIN",
  isActive: true,
  storeId: "s2",
  mustChangePassword: false,
  lastLoginAt: null,
  locked: false,
  ...extra,
});
const USERS = [
  user("me", "Ana Rojo", { role: "SUPER_ADMIN", storeId: null }),
  user("u2", "Marta Ibáñez", { mustChangePassword: true }),
  user("u3", "Óscar Pérez", { isActive: false }),
  user("u4", "Luis Gil", { locked: true }),
];
const STORES = [
  { id: "s1", name: "Medina de Pomar", isActive: true },
  { id: "s2", name: "Villarcayo", isActive: true },
];

beforeEach(() => {
  role = "SUPER_ADMIN";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/users" && init?.method === "POST") return json({ id: "u9" }, 201);
    if (url === "/api/users") return json(USERS);
    if (url === "/api/stores") return json(STORES);
    if (url.endsWith("/reset-password")) return new Response(null, { status: 204 });
    if (url.startsWith("/api/users/")) return json({});
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const body = (method: string) => {
  const call = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === method);
  return call ? [call[0] as string, JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>] : null;
};

describe("users logic", () => {
  it("says the status, most urgent first, and the last access in words", () => {
    expect(statusOf({ isActive: false, locked: true, mustChangePassword: true }).label).toBe("Desactivado");
    expect(statusOf({ isActive: true, locked: true, mustChangePassword: false }).label).toBe("Bloqueado");
    expect(statusOf({ isActive: true, locked: false, mustChangePassword: true }).note).toBe("Debe cambiar contraseña");
    const now = new Date("2026-11-01T13:00:00Z");
    expect(lastAccess(null, now)).toBe("Nunca");
    expect(lastAccess("2026-11-01T12:58:00Z", now)).toBe("Ahora");
    expect(lastAccess("2026-11-01T10:40:00Z", now)).toBe("Hoy 11:40");
    expect(lastAccess("2026-10-31T17:02:00Z", now)).toBe("Ayer 18:02");
    expect(lastAccess("2026-08-02T09:00:00Z", now)).toBe("02/08/2026");
  });

  it("makes readable temporary passwords and suggests the username", () => {
    const p = temporaryPassword();
    expect(p).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
    expect(p).not.toMatch(/[01lIoO]/);
    expect(temporaryPassword()).not.toBe(p);
    expect(suggestUsername("Marta Ibáñez Ruiz")).toBe("marta.ibanez");
    expect(validateNewUser({ fullName: "Al", username: "a b", email: "x", role: "STORE_ADMIN", storeId: "" })).toEqual({
      fullName: "Escribe el nombre, al menos 3 letras.",
      username: "De 3 a 50 caracteres: letras sin tildes, números, punto, guion o guion bajo.",
      email: "Escribe un email válido.",
      storeId: "Elige la tienda de esta cuenta.",
    });
  });
});

describe("UsersPage", () => {
  it("lists accounts with role, store and status, and never offers to deactivate yourself", async () => {
    render(<UsersPage />);
    await act(async () => {});
    const me = screen.getByRole("row", { name: /Ana Rojo/ });
    within(me).getByText("Tú · no puedes desactivarte");
    within(me).getByText("Todas");
    const marta = screen.getByRole("row", { name: /Marta/ });
    within(marta).getByText("Villarcayo");
    within(marta).getByText("Debe cambiar contraseña");
    within(screen.getByRole("row", { name: /Luis Gil/ })).getByText("Bloqueado");
    within(screen.getByRole("row", { name: /Óscar/ })).getByRole("button", { name: "Reactivar" });
  });

  it("asks before resetting a password, then shows the temporary one once", async () => {
    render(<UsersPage />);
    await act(async () => {});
    const marta = screen.getByRole("row", { name: /Marta/ });
    fireEvent.click(within(marta).getByRole("button", { name: "Restablecer contraseña" }));
    expect(body("POST")).toBeNull();
    within(marta).getByText("Se cerrarán sus sesiones y tendrá que cambiarla al entrar.");
    await act(async () => {
      fireEvent.click(within(marta).getByRole("button", { name: "Sí, restablecer" }));
    });
    const [url, sent] = body("POST")!;
    expect(url).toBe("/api/users/u2/reset-password");
    const shown = screen.getByRole("status");
    within(shown).getByText(sent.temporaryPassword as string);
    fireEvent.click(within(shown).getByRole("button", { name: "Ya la he entregado" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("asks before deactivating, and reactivates in one click", async () => {
    render(<UsersPage />);
    await act(async () => {});
    const marta = screen.getByRole("row", { name: /Marta/ });
    fireEvent.click(within(marta).getByRole("button", { name: "Desactivar" }));
    await act(async () => {
      fireEvent.click(within(marta).getByRole("button", { name: "Sí, desactivar" }));
    });
    expect(body("PATCH")).toEqual(["/api/users/u2", { isActive: false }]);
    fetchMock.mockClear();
    await act(async () => {
      fireEvent.click(within(screen.getByRole("row", { name: /Óscar/ })).getByRole("button", { name: "Reactivar" }));
    });
    expect(body("PATCH")).toEqual(["/api/users/u3", { isActive: true }]);
  });

  it("creates a store account with its store and a temporary password", async () => {
    render(<UsersPage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo usuario" }));
    const card = screen.getByRole("complementary", { name: "Nuevo usuario" });
    fireEvent.change(within(card).getByLabelText(/^Nombre/), { target: { value: "Marta Ibáñez" } });
    expect((within(card).getByLabelText(/^Usuario/) as HTMLInputElement).value).toBe("marta.ibanez");
    fireEvent.change(within(card).getByLabelText(/^Email/), { target: { value: "Villarcayo@Kenova.es" } });
    fireEvent.click(within(card).getByRole("button", { name: "Crear usuario" }));
    within(card).getByText("Elige la tienda de esta cuenta.");
    fireEvent.change(within(card).getByRole("combobox", { name: /^Tienda/ }), { target: { value: "s2" } });
    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Crear usuario" }));
    });
    const [, sent] = body("POST")!;
    expect(sent).toMatchObject({
      fullName: "Marta Ibáñez",
      username: "marta.ibanez",
      email: "villarcayo@kenova.es",
      role: "STORE_ADMIN",
      storeId: "s2",
    });
    expect(String(sent.temporaryPassword).length).toBe(14);
    within(screen.getByRole("status")).getByText(/entra con villarcayo@kenova.es/);
  });

  it("keeps store accounts out", () => {
    role = "STORE_ADMIN";
    render(<UsersPage />);
    screen.getByText("Sin permiso.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
