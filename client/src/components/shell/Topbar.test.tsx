import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SessionUser } from "@/components/auth/AuthProvider";
import Topbar, { initials } from "./Topbar";

let user: SessionUser;
const logout = vi.fn();

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user, logout }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/clients",
  useRouter: () => ({ push: vi.fn() }),
}));

const base: SessionUser = {
  id: "u1",
  email: "ana@kenova.es",
  fullName: "Ana Rojo",
  role: "SUPER_ADMIN",
  storeId: null,
  mustChangePassword: false,
};

beforeEach(() => {
  user = base;
  logout.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/stores/s-vc"
        ? new Response(JSON.stringify({ id: "s-vc", name: "Villarcayo" }))
        : new Response("{}", { status: 404 }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const userButton = () => screen.getByRole("button", { name: /Ana Rojo/ });

describe("Topbar", () => {
  it("a partner works across all stores", () => {
    render(<Topbar />);
    expect(screen.getByText("Todas las tiendas")).toBeTruthy();
    expect(screen.getByText("Socio")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a store account sees its own store", async () => {
    user = { ...base, role: "STORE_ADMIN", storeId: "s-vc" };
    render(<Topbar />);
    expect(await screen.findByText("Villarcayo")).toBeTruthy();
    expect(screen.queryByText("Todas las tiendas")).toBeNull();
  });

  it("the user menu opens on click and closes with Esc or a click outside", () => {
    render(<Topbar />);
    expect(screen.queryByText("Cerrar sesión")).toBeNull();
    fireEvent.click(userButton());
    expect(userButton().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("ana@kenova.es")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Cambiar contraseña" }).getAttribute("href"),
    ).toBe("/cuenta/contrasena");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Cerrar sesión")).toBeNull();

    fireEvent.click(userButton());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Cerrar sesión")).toBeNull();
  });

  it("signs out from the menu", () => {
    render(<Topbar />);
    fireEvent.click(userButton());
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(logout).toHaveBeenCalledOnce();
  });

  it("opens the search with Ctrl+K, ⌘K or a click", () => {
    render(<Topbar />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Buscar" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(window, { key: "K", metaKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("initials", () => {
  it("takes the first two words", () => {
    expect(initials("Ana Rojo")).toBe("AR");
    expect(initials("  maría del carmen ")).toBe("MD");
    expect(initials("Diego")).toBe("D");
  });
});
