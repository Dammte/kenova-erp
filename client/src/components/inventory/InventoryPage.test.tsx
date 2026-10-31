import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { InventoryPage } from "./InventoryPage";
import { arrival, margin, signed, stockFill, stockLabel, type PartPage } from "./inventory";

let params = new URLSearchParams();
const replace = vi.fn((url: string) => {
  params = new URLSearchParams(url.split("?")[1] ?? "");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/inventario",
  useSearchParams: () => params,
}));
let role: "SUPER_ADMIN" | "STORE_ADMIN" = "SUPER_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1", role, storeId: null } }) }));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const row = (sku: string, name: string, stock: number, minimalStock: number, status: "out" | "low" | "ok") => ({
  id: sku,
  sku,
  name,
  category: "Baterías",
  brand: "Apple",
  model: "iPhone 13",
  ubication: "Estante B2",
  provider: "MovilParts",
  stock,
  minimalStock,
  status,
  salesPrice: "59.00",
  costPrice: "18.50",
});
const PAGE: PartPage = {
  total: 2,
  page: 1,
  pageSize: 50,
  rows: [row("BAT-IP13", "Batería iPhone 13", 2, 3, "low"), row("PAN-IP13", "Pantalla iPhone 13", 0, 1, "out")],
  counts: { all: 9, low: 5, byCategory: { Pantallas: 4, Baterías: 3, Consumibles: 2 } },
  brands: ["Apple", "Samsung"],
  providers: ["Amazon", "MovilParts"],
};

beforeEach(() => {
  role = "SUPER_ADMIN";
  params = new URLSearchParams();
  replace.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/inventory/list")) return json(PAGE);
    if (url.endsWith("/inventory/BAT-IP13"))
      return json({ ...PAGE.rows[0], description: null, salesPrice: "59", costPrice: "18.5" });
    if (url.endsWith("/BAT-IP13/movements"))
      return json([
        { id: "m2", kind: "order", quantity: -1, stockAfter: 2, note: null, orderId: "o1", orderCode: "MP-0142", userName: "Ana Rojo", createdAt: "2026-10-29T10:00:00Z" },
        { id: "m1", kind: "purchase", quantity: 3, stockAfter: 3, note: null, orderId: null, orderCode: null, userName: null, createdAt: "2026-10-21T10:00:00Z" },
      ]);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("inventory helpers", () => {
  it("says the stock in words, fills the bar and writes the margin", () => {
    expect(stockLabel({ status: "out", minimalStock: 2 })).toBe("Sin stock");
    expect(stockLabel({ status: "low", minimalStock: 3 })).toBe("Bajo · mín. 3");
    expect(stockLabel({ status: "ok", minimalStock: 3 })).toBe("En stock");
    expect([stockFill(2, 3), stockFill(9, 3), stockFill(1, 0), stockFill(0, 0)]).toEqual([33, 100, 100, 0]);
    expect(margin("59.00", "18.50")).toBe("69 %");
    expect(margin(null, "0.90")).toBe("—");
    expect([signed(4), signed(-1)]).toEqual(["+4", "−1"]);
    expect(arrival({ expectedAt: null, waitingDays: 9, late: true })).toBe("Sin fecha · 9 días");
    expect(arrival({ expectedAt: "2026-10-31", waitingDays: 1, late: false })).toBe("31/10/2026");
    expect(arrival({ expectedAt: "2026-10-30", waitingDays: 4, late: true })).toBe("30/10/2026 · retrasado");
  });
});

describe("InventoryPage", () => {
  it("lists the parts with their stock in words and the chip counts", async () => {
    render(<InventoryPage />);
    await act(async () => {});
    const low = screen.getByRole("row", { name: /Batería iPhone 13/ });
    within(low).getByText("Bajo · mín. 3");
    within(screen.getByRole("row", { name: /Pantalla iPhone 13/ })).getByText("Sin stock");
    screen.getByRole("button", { name: "Baterías 3" });
    screen.getByRole("button", { name: "Stock bajo · 5" });
    screen.getByText("2 repuestos");
  });

  it("keeps the filters in the address and sends them to the server", async () => {
    render(<InventoryPage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Stock bajo · 5" }));
    expect(replace).toHaveBeenLastCalledWith("/inventario?bajo=1", { scroll: false });
    fireEvent.change(screen.getByRole("combobox", { name: "Marca" }), { target: { value: "Apple" } });
    // The address is not re-read here, so each change starts from the first one.
    expect(replace).toHaveBeenLastCalledWith("/inventario?marca=Apple", { scroll: false });

    cleanup();
    params = new URLSearchParams("categoria=Baterías&bajo=1&proveedor=MovilParts");
    render(<InventoryPage />);
    await act(async () => {});
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      "/api/inventory/list?category=Bater%C3%ADas&low=true&provider=MovilParts",
    );
    expect(screen.getByRole("button", { name: "Baterías 3" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("searches once the user stops typing", async () => {
    vi.useFakeTimers();
    render(<InventoryPage />);
    await act(async () => {});
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar repuesto" }), { target: { value: "bateria 13" } });
    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(replace).toHaveBeenCalledWith("/inventario?q=bateria+13", { scroll: false });
  });

  it("opens a part with its prices, margin and stock history", async () => {
    params = new URLSearchParams("repuesto=BAT-IP13");
    render(<InventoryPage />);
    await act(async () => {});
    const card = screen.getByRole("complementary", { name: "Repuesto Batería iPhone 13" });
    expect(within(card).getByText("Margen").nextSibling?.textContent).toBe("69 %");
    const use = within(card).getByRole("row", { name: /MP-0142/ });
    within(use).getByText("Uso");
    within(use).getByText("−1");
    expect(within(use).getByRole("link", { name: "MP-0142" }).getAttribute("href")).toBe("/ordenes?orden=o1");
    within(within(card).getByRole("row", { name: /Entrada/ })).getByText("+3");
    fireEvent.click(within(card).getByRole("button", { name: "Cerrar ficha" }));
    expect(replace).toHaveBeenLastCalledWith("/inventario", { scroll: false });
  });

  it("explains the empty states", async () => {
    fetchMock.mockImplementation(async () => json({ ...PAGE, total: 0, rows: [] }));
    render(<InventoryPage />);
    await act(async () => {});
    screen.getByText("Aún no hay repuestos. Importa tu primera factura o crea uno.");

    cleanup();
    params = new URLSearchParams("q=xyz");
    render(<InventoryPage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(replace).toHaveBeenLastCalledWith("/inventario", { scroll: false });
  });

  it("tells a store the inventory is the partners'", () => {
    role = "STORE_ADMIN";
    render(<InventoryPage />);
    screen.getByText(/El inventario lo gestionan los socios/);
    expect(screen.getByRole("link", { name: "Volver al Panel" }).getAttribute("href")).toBe("/panel");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists the part orders and receives one", async () => {
    params = new URLSearchParams("vista=pedidos");
    const order = {
      id: "po1",
      orderId: "o9",
      orderCode: "MP-0129",
      orderStatus: "pendiente_piezas",
      assignedTo: "Javier M.",
      inventoryId: "BAT-SGA54",
      partName: "Batería Galaxy A54",
      provider: "RecambiosNorte",
      quantity: 1,
      orderedAt: "2026-10-20",
      expectedAt: null,
      receivedAt: null,
      receivedBy: null,
      waitingDays: 11,
      late: true,
    };
    const done = { ...order, id: "po2", orderCode: "MP-0120", partName: "Flex iPad 9", receivedAt: "2026-10-28T09:00:00Z", receivedBy: "Ana Rojo", late: false };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/part-orders/po1/receive") && init?.method === "POST")
        return json({ ...order, receivedAt: "2026-10-31T10:00:00Z", receivedBy: "Ana Rojo", late: false });
      if (url.endsWith("/api/part-orders")) return json([order, done]);
      return json({}, 404);
    });
    render(<InventoryPage />);
    await act(async () => {});
    expect(screen.getByRole("tab", { name: "Pedidos" }).getAttribute("aria-selected")).toBe("true");
    const row = screen.getByRole("row", { name: /Batería Galaxy A54/ });
    within(row).getByText("Para Javier M.");
    within(row).getByText("Sin fecha · 11 días");
    expect(within(row).getByRole("link", { name: "MP-0129" }).getAttribute("href")).toBe("/ordenes?orden=o9");
    within(screen.getByRole("row", { name: /Flex iPad 9/ })).getByText("Recibido 28/10/2026 · Ana Rojo");
    screen.getByText("1 pendiente");

    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "Marcar recibido" }));
    });
    expect(fetchMock.mock.calls.some((c) => (c[0] as string).endsWith("/po1/receive"))).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "Batería Galaxy A54 recibido y sumado al stock. MP-0129 sigue en «Pendiente de piezas»",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Repuestos" }));
    expect(replace).toHaveBeenLastCalledWith("/inventario", { scroll: false });
  });
});
