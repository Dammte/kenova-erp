import { describe, expect, it } from "vitest";
import { isActive, navFor } from "./nav";

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("navFor", () => {
  it("the partners see stock and settings", () => {
    const nav = navFor("SUPER_ADMIN");
    expect(labels(nav.main)).toEqual(["Panel", "Órdenes", "Clientes", "Inventario"]);
    expect(labels(nav.settings)).toEqual(["Servicios", "Usuarios"]);
  });

  it("a store sees neither stock nor settings", () => {
    const nav = navFor("STORE_ADMIN");
    expect(labels(nav.main)).toEqual(["Panel", "Órdenes", "Clientes"]);
    expect(nav.settings).toEqual([]);
  });
});

describe("isActive", () => {
  it("matches the section and its pages, not lookalikes", () => {
    expect(isActive("/clients", "/clients")).toBe(true);
    expect(isActive("/clients", "/clients/42")).toBe(true);
    expect(isActive("/serviceOrders", "/serviceOrders/newServiceOrder")).toBe(true);
    expect(isActive("/services", "/serviceOrders")).toBe(false);
    expect(isActive("/clients", "/clientsx")).toBe(false);
  });
});
