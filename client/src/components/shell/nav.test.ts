import { describe, expect, it } from "vitest";
import { isActive, navFor } from "./nav";

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("navFor", () => {
  it("the partners see stock and settings", () => {
    const nav = navFor("SUPER_ADMIN");
    expect(labels(nav.main)).toEqual(["Panel", "Órdenes", "Presupuestos", "Tarifas", "Clientes", "Inventario", "Dinero"]);
    expect(labels(nav.settings)).toEqual(["Servicios", "Plantillas", "Usuarios"]);
  });

  it("a store sees no stock and only its own notice texts in settings", () => {
    const nav = navFor("STORE_ADMIN");
    expect(labels(nav.main)).toEqual(["Panel", "Órdenes", "Presupuestos", "Tarifas", "Clientes", "Dinero"]);
    expect(labels(nav.settings)).toEqual(["Plantillas"]);
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

  it("Órdenes stays lit on the older order screens", () => {
    expect(isActive("/ordenes", "/ordenes")).toBe(true);
    expect(isActive("/ordenes", "/serviceOrders/42")).toBe(true);
    expect(isActive("/ordenes", "/services")).toBe(false);
  });

  it("Clientes stays lit on the older client screens", () => {
    expect(isActive("/clientes", "/clientes")).toBe(true);
    expect(isActive("/clientes", "/clients/42")).toBe(true);
  });

  it("Inventario stays lit on the older part screens", () => {
    expect(isActive("/inventario", "/inventory/add-part")).toBe(true);
  });
});
