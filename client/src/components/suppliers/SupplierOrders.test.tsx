import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SupplierOrdersPage } from "./SupplierOrdersPage";
import { linesTotal, syncSummary, type SupplierOrder } from "./orders";
import type { SupplierData } from "./suppliers";

let params = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/proveedores/pedidos",
  useSearchParams: () => params,
}));
let role: "SUPER_ADMIN" | "STORE_ADMIN" = "SUPER_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "me", role, storeId: null } }) }));

const SUPPLIER: SupplierData = {
  id: "p1",
  name: "Repuestos Norte",
  taxId: null,
  customerNumber: null,
  contactName: null,
  email: null,
  phone: null,
  website: "https://b2b.norte.test",
  notes: null,
  active: true,
  connection: { kind: "html" } as SupplierData["connection"],
  credentialsUpdatedAt: "2026-11-25T10:00:00Z",
  ordersSyncedAt: null,
};

const order = (id: string, extra: Partial<SupplierOrder> = {}): SupplierOrder => ({
  id,
  supplierId: "p1",
  supplier: { id: "p1", name: "Repuestos Norte" },
  externalId: id,
  reference: `REF${id}`,
  orderDate: "2026-11-25",
  total: "106.03",
  payment: "Tarjeta",
  supplierStatus: "Enviado",
  invoiceUrl: null,
  detailUrl: `https://b2b.norte.test/pedido/${id}`,
  state: "PENDIENTE",
  linesReadAt: "2026-11-25T10:00:00Z",
  createdAt: "2026-11-25T10:00:00Z",
  ...extra,
});
const LINES = [
  {
    id: "l1",
    position: 0,
    description: "Batería X",
    ref: "BT0001",
    productUrl: "https://b2b.norte.test/busqueda?s=BT0001",
    quantity: 2,
    unitPrice: "20.52",
    lineTotal: "41.04",
  },
];

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let listing: SupplierOrder[];

beforeEach(() => {
  role = "SUPER_ADMIN";
  params = new URLSearchParams();
  replace.mockClear();
  listing = [order("1"), order("2", { state: "ANTERIOR", linesReadAt: null })];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/suppliers") return json([SUPPLIER]);
    if (url === "/api/suppliers/p1/sync") return json({ added: 1, updated: 0, waiting: 0, firstSync: false });
    if (url.startsWith("/api/supplier-orders?"))
      return json({ items: listing, total: listing.length, page: 1, pageSize: 50, counts: { PENDIENTE: 1, ANTERIOR: 1 } });
    if (url === "/api/supplier-orders/2" && init?.method === "PATCH")
      return json({ ...order("2"), lines: LINES, state: JSON.parse(init.body as string).state });
    if (url === "/api/supplier-orders/2") return json({ ...listing[1], lines: [] });
    if (url === "/api/supplier-orders/1") return json({ ...listing[0], lines: LINES });
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = async () => {
  render(<SupplierOrdersPage />);
  await act(async () => {});
};

describe("Pedidos al proveedor", () => {
  it("lists the orders with their state, and counts per state", async () => {
    await show();
    expect(screen.getByText("REF1")).toBeTruthy();
    const chips = within(screen.getByRole("group", { name: "Estado" }));
    expect(chips.getByRole("button", { name: /Pendiente de recibir 1/ })).toBeTruthy();
    expect(chips.getByRole("button", { name: /Todos 2/ })).toBeTruthy();
    expect(screen.getAllByText(/25\/11\/2026 · 106,03\s€ · Enviado/)).toHaveLength(2);
  });

  it("is the first tab of «Proveedores», with the orders still to receive", async () => {
    await show();
    screen.getByRole("heading", { name: "Proveedores" });
    const tabs = within(screen.getByRole("navigation", { name: "Proveedores" }));
    expect(tabs.getByRole("link", { current: "page" }).textContent).toBe("Pedidos1");
    expect(tabs.getByRole("link", { name: /Proveedores/ }).getAttribute("href")).toBe("/proveedores");
  });

  it("filters by state through the address", async () => {
    await show();
    fireEvent.click(within(screen.getByRole("group", { name: "Estado" })).getByRole("button", { name: /Anterior al ERP/ }));
    expect(replace).toHaveBeenCalledWith("/proveedores/pedidos?estado=ANTERIOR", { scroll: false });
  });

  it("asks the server with the filters in the address", async () => {
    params = new URLSearchParams("estado=PENDIENTE&q=bt0001");
    await show();
    const asked = fetchMock.mock.calls.map(([u]) => u as string).find((u) => u.startsWith("/api/supplier-orders?"));
    expect(asked).toBe("/api/supplier-orders?state=PENDIENTE&q=bt0001");
  });

  it("«Sincronizar ahora» reads the website and says what it added", async () => {
    await show();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sincronizar ahora" }));
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/suppliers/p1/sync", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("status").textContent).toBe("1 pedido nuevo, pendientes de recibir.");
  });

  it("cannot sync until the supplier has its login saved", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/suppliers") return json([{ ...SUPPLIER, credentialsUpdatedAt: null }]);
      return json({ items: [], total: 0, page: 1, pageSize: 50, counts: {} });
    });
    await show();
    const button = screen.getByRole("button", { name: "Sincronizar ahora" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Guarda antes sus credenciales en Proveedores")).toBeTruthy();
    expect(screen.getByText(/Todavía no hay pedidos/)).toBeTruthy();
  });

  it("shows an order with its links and lines", async () => {
    params = new URLSearchParams("pedido=1");
    await show();
    const card = within(screen.getByRole("complementary", { name: "Pedido REF1" }));
    expect(card.getByRole("link", { name: /Ver el pedido en su web/ }).getAttribute("href")).toBe("https://b2b.norte.test/pedido/1");
    expect(card.getByRole("link", { name: "Batería X" }).getAttribute("href")).toBe("https://b2b.norte.test/busqueda?s=BT0001");
    expect(card.getByText("Suma de las líneas").nextSibling?.textContent).toMatch(/^41,04\s€$/);
    expect(card.getByRole("button", { name: "Descartar" })).toBeTruthy();
    expect(card.getByRole("link", { name: "Revisar y recibir" }).getAttribute("href")).toBe("/inventario?vista=importar&pedidoProveedor=1");
  });

  it("an order from before the ERP can be made pending, which reads its lines", async () => {
    params = new URLSearchParams("pedido=2");
    await show();
    const card = within(screen.getByRole("complementary", { name: "Pedido REF2" }));
    expect(card.getByText(/Todavía no se han leído sus líneas/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(card.getByRole("button", { name: "Marcar pendiente de recibir" }));
    });
    const patch = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "PATCH");
    expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({ state: "PENDIENTE" });
    expect(card.getByRole("link", { name: "Batería X" })).toBeTruthy();
  });

  it("is only for the administrator", async () => {
    role = "STORE_ADMIN";
    await show();
    expect(screen.getByText(/Sin permiso/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("helpers", () => {
  it("says what «Sincronizar» did", () => {
    expect(syncSummary({ added: 804, updated: 0, waiting: 0, firstSync: true })).toMatch(/^804 pedidos guardados como «Anterior al ERP»/);
    expect(syncSummary({ added: 0, updated: 2, waiting: 0, firstSync: false })).toBe(
      "Ningún pedido nuevo. 2 pedidos actualizados (estado o factura del proveedor).",
    );
    expect(syncSummary({ added: 20, updated: 0, waiting: 3, firstSync: false })).toBe(
      "20 pedidos nuevos, pendientes de recibir. Quedan 3 pedidos por traer: vuelve a pulsar «Sincronizar ahora».",
    );
  });

  it("adds up the lines, using quantity × price when the total is missing", () => {
    expect(linesTotal([...LINES, { ...LINES[0], lineTotal: null, unitPrice: "1.5", quantity: 3 }])).toBeCloseTo(45.54);
  });
});
