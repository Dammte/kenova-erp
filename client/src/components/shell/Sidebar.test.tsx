import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SessionUser } from "@/components/auth/AuthProvider";
import Sidebar from "./Sidebar";

let user: SessionUser;
let pathname = "/serviceOrders";

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user, logout: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const asRole = (role: SessionUser["role"]): SessionUser => ({
  id: `u-${role}`,
  email: "x@kenova.test",
  fullName: "Ana Rojo",
  role,
  mustChangePassword: false,
});

const bar = () => screen.getByRole("complementary", { name: "Menú principal" });
const folded = () => bar().hasAttribute("data-collapsed");

beforeEach(() => {
  localStorage.clear();
  window.innerWidth = 1440;
  pathname = "/serviceOrders";
  user = asRole("SUPER_ADMIN");
});
afterEach(cleanup);

describe("Sidebar", () => {
  it("marks the section the user is in", () => {
    pathname = "/serviceOrders/123/edit";
    render(<Sidebar />);
    expect(
      screen.getByRole("link", { name: "Órdenes" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Clientes" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("a store account has no stock and no settings", () => {
    user = asRole("STORE_ADMIN");
    render(<Sidebar />);
    expect(screen.queryByRole("link", { name: "Inventario" })).toBeNull();
    expect(screen.queryByText("Configuración")).toBeNull();
    expect(screen.getByRole("link", { name: "Nueva orden" })).toBeTruthy();
  });

  it("starts open on desktop and folded on tablet", () => {
    render(<Sidebar />);
    expect(folded()).toBe(false);
    cleanup();
    window.innerWidth = 1024;
    render(<Sidebar />);
    expect(folded()).toBe(true);
  });

  it("folds on click or Ctrl+B and remembers it for that user", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Plegar barra" }));
    expect(folded()).toBe(true);
    act(() => {
      fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    });
    expect(folded()).toBe(false);
    act(() => {
      fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    });
    cleanup();
    render(<Sidebar />);
    expect(folded()).toBe(true);

    // Another user on the same computer keeps their own choice.
    cleanup();
    user = asRole("STORE_ADMIN");
    render(<Sidebar />);
    expect(folded()).toBe(false);
  });

  it("never unfolds on hover", () => {
    window.innerWidth = 1024;
    render(<Sidebar />);
    fireEvent.mouseEnter(bar());
    expect(folded()).toBe(true);
  });
});
