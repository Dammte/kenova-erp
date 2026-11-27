import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { InventoryPage } from "./InventoryPage";
import { arrival, margin, partsFileName, partsSheet, signed, stockFill, stockLabel, summaryLine, type PartPage } from "./inventory";

const written: { rows: unknown[][]; name: string }[] = [];
vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: (rows: unknown[][]) => ({ rows }),
    book_new: () => ({ sheets: [] as unknown[] }),
    book_append_sheet: (book: { sheets: unknown[] }, sheet: unknown) => book.sheets.push(sheet),
  },
  writeFile: (book: { sheets: { rows: unknown[][] }[] }, name: string) => written.push({ rows: book.sheets[0].rows, name }),
}));

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
  counts: { all: 9, low: 5, out: 2, byCategory: { Pantallas: 4, Baterías: 3, Consumibles: 2 } },
  summary: { parts: 312, low: 5, out: 3, costValue: "6214.30" },
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
  it("writes the line under the title, leaving out what is zero", () => {
    const eur = (v: string) => `${v} €`;
    expect(summaryLine({ parts: 1, low: 0, out: 1, costValue: "0.00" }, eur)).toBe(
      "1 repuesto · 1 agotado · valor de coste 0.00 €",
    );
    expect(summaryLine({ parts: 0, low: 0, out: 0, costValue: "0.00" }, eur)).toBe("0 repuestos · valor de coste 0.00 €");
  });

  it("says the stock in words, fills the bar and writes the margin", () => {
    expect(stockLabel({ status: "out", minimalStock: 2 })).toBe("Sin stock");
    expect(stockLabel({ status: "low", minimalStock: 3 })).toBe("Bajo · mín. 3");
    expect(stockLabel({ status: "ok", minimalStock: 3 })).toBe("En stock");
    expect([stockFill(2, 3), stockFill(9, 3), stockFill(1, 0), stockFill(0, 0)]).toEqual([33, 100, 100, 0]);
    expect(margin("59.00", "18.50")).toBe("69 %");
    expect(margin(null, "0.90")).toBe("—");
    expect(margin("149.00", null)).toBe("—");
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
    // Design R3 3.7: the whole inventory under the title, then the quick views.
    screen.getByText(/^312 repuestos · 5 bajo mínimo · 3 agotados · valor de coste 6\.?214,30\s€$/);
    const views = within(screen.getByRole("group", { name: "Vista rápida" }));
    expect(views.getAllByRole("button").map((b) => b.textContent)).toEqual(["Todos 9", "Stock bajo 5", "Agotados 2"]);
    screen.getByRole("option", { name: "Baterías (3)" });
    within(screen.getByRole("row", { name: /Batería iPhone 13/ })).getByText("69 %");
    screen.getByText("2 repuestos");
  });

  it("keeps the filters in the address and sends them to the server", async () => {
    render(<InventoryPage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Stock bajo 5" }));
    expect(replace).toHaveBeenLastCalledWith("/inventario?bajo=1", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Agotados 2" }));
    expect(replace).toHaveBeenLastCalledWith("/inventario?agotados=1", { scroll: false });
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
    expect((screen.getByRole("combobox", { name: "Categoría" }) as HTMLSelectElement).value).toBe("Baterías");
    expect(screen.getByRole("button", { name: "Stock bajo 5" }).getAttribute("aria-pressed")).toBe("true");

    cleanup();
    params = new URLSearchParams("agotados=1");
    render(<InventoryPage />);
    await act(async () => {});
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/inventory/list?out=true");
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

  it("sends a part to the Papelera after asking, and closes its card", async () => {
    params = new URLSearchParams("repuesto=BAT-IP13");
    render(<InventoryPage />);
    await act(async () => {});
    const card = within(screen.getByRole("complementary", { name: "Repuesto Batería iPhone 13" }));
    fireEvent.click(card.getByRole("button", { name: "Eliminar" }));
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "DELETE")).toBe(false);
    card.getByText(/Se puede recuperar desde Papelera/);

    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 500 }));
    await act(async () => fireEvent.click(card.getByRole("button", { name: "Sí, eliminar" })));
    card.getByRole("alert");
    expect(replace).not.toHaveBeenCalled();

    fetchMock.mockImplementationOnce(async () => new Response(null, { status: 204 }));
    await act(async () => fireEvent.click(card.getByRole("button", { name: "Sí, eliminar" })));
    const del = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "DELETE");
    expect(del.map((c) => c[0])).toEqual(["/api/inventory/BAT-IP13", "/api/inventory/BAT-IP13"]);
    expect(replace).toHaveBeenLastCalledWith("/inventario", { scroll: false });
  });

  it("exports every part to Excel with numeric prices", async () => {
    written.length = 0;
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/inventory"
        ? json([{ ...PAGE.rows[0], salesPrice: "59", costPrice: "18.5", category: null }])
        : url.startsWith("/api/inventory/list")
          ? json(PAGE)
          : json({}, 404),
    );
    render(<InventoryPage />);
    await act(async () => {});
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Exportar Excel" })));
    expect(written).toHaveLength(1);
    expect(written[0].name).toMatch(/^Inventario_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(written[0].rows[1].slice(7, 9)).toEqual([59, 18.5]);
    expect(partsSheet([{ ...PAGE.rows[0], salesPrice: "59", costPrice: null, category: null }])[1]).toEqual([
      "BAT-IP13", "Batería iPhone 13", "", "Apple", "iPhone 13", 2, 3, 59, "", "Estante B2", "MovilParts",
    ]);
    expect(partsFileName(new Date(2026, 10, 27, 23, 30))).toBe("Inventario_2026-11-27.xlsx");
  });

  it("opens the new and edit forms in the side card, in the address", async () => {
    render(<InventoryPage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo repuesto" }));
    expect(replace).toHaveBeenLastCalledWith("/inventario?repuesto=nuevo", { scroll: false });

    cleanup();
    params = new URLSearchParams("repuesto=nuevo");
    render(<InventoryPage />);
    await act(async () => {});
    screen.getByRole("complementary", { name: "Nuevo repuesto" });

    cleanup();
    params = new URLSearchParams("repuesto=BAT-IP13");
    render(<InventoryPage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(replace).toHaveBeenLastCalledWith("/inventario?repuesto=BAT-IP13&editar=1", { scroll: false });

    cleanup();
    params = new URLSearchParams("repuesto=BAT-IP13&editar=1");
    render(<InventoryPage />);
    await act(async () => {});
    screen.getByRole("complementary", { name: "Editar repuesto" });
    screen.getByText("Editar repuesto · BAT-IP13");
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
    screen.getByText(/El inventario lo gestiona el administrador/);
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
    expect(screen.getByRole("tab", { name: "Pedidos de piezas" }).getAttribute("aria-selected")).toBe("true");
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
