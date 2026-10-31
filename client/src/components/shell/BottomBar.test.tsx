import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { SessionUser } from "@/components/auth/AuthProvider";
import BottomBar, { OPEN_SEARCH_EVENT } from "./BottomBar";

let user: SessionUser;
let pathname = "/serviceOrders";

vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user }) }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

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
  pathname = "/serviceOrders";
});
afterEach(cleanup);

const bar = () => screen.getByRole("navigation", { name: "Menú principal" });

describe("BottomBar", () => {
  it("keeps the daily sections, «Nueva», «Buscar» and «Menú» on the bar", () => {
    render(<BottomBar />);
    const items = Array.from(bar().children).map((el) => el.textContent);
    expect(items).toEqual(["Panel", "Órdenes", "Nueva", "Buscar", "Menú"]);
    expect(within(bar()).getByRole("link", { name: "Órdenes" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(bar()).getByRole("link", { name: "Nueva" }).getAttribute("href")).toBe(
      "/ordenes/nueva",
    );
  });

  it("«Menú» holds the rest; a store's only setting is its notice texts", () => {
    const { rerender } = render(<BottomBar />);
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    const sheet = screen.getByRole("dialog", { name: "Menú" });
    expect(within(sheet).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Presupuestos",
      "Tarifas",
      "Clientes",
      "Inventario",
      "Dinero",
      "Servicios",
      "Plantillas",
      "Usuarios",
    ]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    user = { ...base, role: "STORE_ADMIN", storeId: "s1" };
    rerender(<BottomBar />);
    fireEvent.click(screen.getByRole("button", { name: "Menú" }));
    expect(
      within(screen.getByRole("dialog")).getAllByRole("link").map((a) => a.textContent),
    ).toEqual(["Presupuestos", "Tarifas", "Clientes", "Dinero", "Plantillas"]);
  });

  it("marks «Menú» when the current section lives in it", () => {
    pathname = "/clients/c1";
    render(<BottomBar />);
    expect(screen.getByRole("button", { name: "Menú" }).getAttribute("aria-current")).toBe("page");
  });

  it("«Buscar» asks the top bar to open the search", () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_SEARCH_EVENT, listener);
    render(<BottomBar />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(OPEN_SEARCH_EVENT, listener);
  });
});
