import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import OrderList, { bulkMessage } from "./OrderList";
import { daysLevel, queryString, readQuery, type OrderListPage } from "./orderList";

const push = vi.fn();
const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/ordenes",
  useSearchParams: () => new URLSearchParams(search),
}));

const fetchMock = vi.fn();

const counts = {
  open: 2,
  all: 3,
  en_progreso: 1,
  pendiente_cliente: 0,
  pendiente_piezas: 0,
  finalizado: 1,
  entregado: 1,
  cancelado: 0,
};

const PAGE: OrderListPage = {
  rows: [
    {
      id: "o1",
      code: "MP-0142",
      status: "en_progreso",
      priority: "urgent",
      clientName: "Lucía Fernández",
      phoneNumber: "612 345 678",
      device: "Apple iPhone 13",
      faults: ["broken_screen", "battery"],
      services: ["Cambio de pantalla", "Batería", "Limpieza"],
      totalPrice: 129,
      balance: 90,
      paymentStatus: "paid_partial",
      createdAt: "2026-10-01T10:00:00Z",
      days: 40,
      uncollected: false,
    },
    {
      id: "o2",
      code: "MP-0097",
      status: "finalizado",
      priority: "low",
      clientName: "Alba Moreno",
      phoneNumber: null,
      device: "Apple iPad 9",
      faults: [],
      services: [],
      totalPrice: 0,
      balance: 0,
      paymentStatus: "paid",
      createdAt: "2026-09-01T10:00:00Z",
      days: 8,
      uncollected: true,
      warrantyOf: "MP-0098",
    },
  ],
  total: 2,
  page: 1,
  pageSize: 50,
  counts,
};

const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  search = "";
  push.mockReset();
  replace.mockReset();
  fetchMock.mockReset();
  respond(PAGE);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function show() {
  render(<OrderList />);
  await act(async () => {});
}

const requested = () => fetchMock.mock.calls.at(-1)?.[0] as string;

describe("OrderList", () => {
  it("opens on the open orders and shows each tab's count", async () => {
    await show();
    expect(requested()).toBe("/api/service-orders/list");
    const tab = screen.getByRole("button", { name: /Abiertas/ });
    expect(tab.getAttribute("aria-current")).toBe("page");
    expect(tab.textContent).toBe("Abiertas2");
    expect(screen.getByRole("button", { name: /Todas/ }).textContent).toBe("Todas3");
  });

  it("shows on each row what the counter needs at a glance", async () => {
    await show();
    const [first, second] = screen.getAllByRole("row").slice(1);
    const row = within(first);
    expect(row.getByRole("link", { name: "MP-0142" }).getAttribute("href")).toBe(
      "/ordenes?orden=o1",
    );
    row.getByText("612 345 678");
    expect(row.getByText("Pantalla, Batería · 3 servicios").getAttribute("title")).toBe(
      "Cambio de pantalla\nBatería\nLimpieza",
    );
    row.getByText("Urgente");
    row.getByText(/^129,00\s€$/);
    row.getByText("Debe 90,00 €");
    row.getByLabelText("40 días en taller");
    row.getByText("01/10");
    // Not finished: nobody needs telling yet.
    row.getByText("—");
    within(second).getByText("Sin avisar");
    within(second).getByText("sin recoger");
    within(second).getByText("Garantía de MP-0098");
    expect(row.queryByText(/Garantía de/)).toBeNull();
    within(second).getByLabelText("8 días sin recoger");
    expect(within(second).queryByText(/Debe/)).toBeNull();
  });

  it("opens the order's panel when a row is clicked, keeping the list", async () => {
    search = "tab=all";
    await show();
    fireEvent.click(screen.getByText("Lucía Fernández"));
    expect(replace).toHaveBeenCalledWith("/ordenes?tab=all&orden=o1", { scroll: false });
  });

  it("shows the panel of the order in the address and closes it", async () => {
    search = "orden=o1";
    // The panel's own calls fail; the list behind it still loads.
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/service-orders/list")
        ? new Response(JSON.stringify(PAGE))
        : new Response("{}", { status: 500 }),
    );
    await show();
    const panel = screen.getByRole("dialog", { name: "Orden MP-0142" });
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/service-orders/o1");
    // The focus goes to the panel's title and the row stays marked.
    expect(document.activeElement).toBe(within(panel).getByRole("heading", { name: "MP-0142" }));
    const link = screen.getByRole("link", { name: "MP-0142" });
    expect(link.getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(replace).toHaveBeenCalledWith("/ordenes", { scroll: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(document.activeElement).toBe(link);
  });

  it("right after creating an order, the focus is on printing its receipt", async () => {
    search = "orden=o1&creada=1";
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/service-orders/list")
        ? new Response(JSON.stringify(PAGE))
        : new Response("{}", { status: 500 }),
    );
    await show();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Imprimir resguardo" }));
  });

  it("asks for what the address says and changes tab from page 1", async () => {
    search = "tab=finalizado&vista=debt&page=2";
    await show();
    expect(requested()).toBe("/api/service-orders/list?tab=finalizado&view=debt&page=2");
    fireEvent.click(screen.getByRole("button", { name: /Entregadas/ }));
    expect(replace).toHaveBeenCalledWith("/ordenes?tab=entregado&vista=debt", { scroll: false });
  });

  it("quick views show their counts and filter the list, one at a time", async () => {
    respond({ ...PAGE, views: { urgent: 1, to_notify: 2, uncollected: 0, debt: 1 } });
    await show();
    const views = within(screen.getByRole("group", { name: "Vistas rápidas" }));
    expect(views.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Urgentes y altas1",
      "Listas para avisar2",
      "Sin recoger +15 días0",
      "Con saldo1",
    ]);
    fireEvent.click(views.getByRole("button", { name: /Listas para avisar/ }));
    expect(replace).toHaveBeenLastCalledWith("/ordenes?vista=to_notify", { scroll: false });
  });

  it("a view already on turns off", async () => {
    search = "vista=urgent";
    await show();
    const on = within(screen.getByRole("group", { name: "Vistas rápidas" })).getByRole("button", { pressed: true });
    expect(on.textContent).toMatch(/^Urgentes y altas/);
    fireEvent.click(on);
    expect(replace).toHaveBeenLastCalledWith("/ordenes", { scroll: false });
  });

  it("searches once the user stops typing", async () => {
    vi.useFakeTimers();
    await show();
    fireEvent.change(screen.getByLabelText("Buscar órdenes"), { target: { value: "lucia" } });
    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(replace).toHaveBeenCalledWith("/ordenes?q=lucia", { scroll: false });
  });

  it("Enter on an exact order number opens it", async () => {
    search = "q=mp-0142";
    await show();
    fireEvent.keyDown(screen.getByLabelText("Buscar órdenes"), { key: "Enter" });
    expect(replace).toHaveBeenCalledWith("/ordenes?q=mp-0142&orden=o1", { scroll: false });
  });

  it("an empty search says why and clears the filters", async () => {
    search = "q=galaxy%20s9&debt=true";
    respond({ ...PAGE, rows: [], total: 0 });
    await show();
    screen.getByText("Ninguna orden coincide con «galaxy s9» en «Con saldo».");
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
    expect(replace).toHaveBeenCalledWith("/ordenes", { scroll: false });
  });

  it("an empty tab says what would appear there", async () => {
    search = "tab=pendiente_piezas";
    respond({ ...PAGE, rows: [], total: 0 });
    await show();
    screen.getByText("No hay órdenes pendientes de piezas");
  });

  it("offers to retry when the list cannot load", async () => {
    respond({ message: "boom" }, 500);
    await show();
    screen.getByText(/No se ha podido cargar la lista/);
    respond(PAGE);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await act(async () => {});
    screen.getByText("Lucía Fernández");
  });

  it("changes a status on the spot and can undo it", async () => {
    vi.useFakeTimers();
    await show();
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /cambiar estado de MP-0142/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pendiente cliente" }));
    await act(async () => {});
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/service-orders/o1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ status: "pendiente_cliente" }));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/service-orders/list");
    screen.getByText("MP-0142 pasa a Pendiente cliente.");

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    await act(async () => {});
    expect(fetchMock.mock.calls[2][1].body).toBe(JSON.stringify({ status: "en_progreso" }));
    screen.getByText("MP-0142 vuelve a En progreso.");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("«Finalizar…» opens its dialog over the list, and «Abrir la orden» its panel", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: /cambiar estado de MP-0142/ }));
    respond({ id: "o1", workDone: null });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Finalizar…/ }));
    });
    screen.getByRole("dialog", { name: "Finalizar MP-0142" });
    expect(requested()).toBe("/api/service-orders/o1");
    fireEvent.change(screen.getByLabelText(/Trabajo realizado/), { target: { value: "Pantalla cambiada" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finalizar orden" }));
    });
    screen.getByRole("dialog", { name: "MP-0142 finalizada" });
    fireEvent.click(screen.getByRole("button", { name: "Abrir la orden" }));
    expect(replace).toHaveBeenLastCalledWith("/ordenes?orden=o1", { scroll: false });
    expect(screen.queryByRole("dialog", { name: /MP-0142/ })).toBeNull();
  });

  it("says why a status change was refused and keeps the old status", async () => {
    await show();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Orden no encontrada" }), { status: 404 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /cambiar estado de MP-0142/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pendiente de piezas" }));
    await act(async () => {});
    screen.getByText(
      "No se ha podido cambiar MP-0142 a Pendiente de piezas. Orden no encontrada",
    );
    screen.getByRole("button", { name: /^En progreso: cambiar estado/ });
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it("opens the labels of the picked orders to print them at once (B4)", async () => {
    await show();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas las de esta página" }));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Acciones en lote" })).getByRole("button", { name: "Imprimir etiquetas" }),
    );
    expect(push).toHaveBeenCalledWith("/ordenes/etiquetas?ids=o1,o2");
  });

  it("changes the status of the picked orders at once and says what did not move (B4)", async () => {
    await show();
    expect(screen.queryByRole("region", { name: "Acciones en lote" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todas las de esta página" }));
    const bar = within(screen.getByRole("region", { name: "Acciones en lote" }));
    bar.getByText("2 seleccionadas");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar MP-0097" }));
    bar.getByText("1 seleccionada");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar MP-0097" }));
    // Picking does not open the order.
    expect(replace).not.toHaveBeenCalled();

    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/bulk-status")
        ? new Response(
            JSON.stringify({
              changed: [{ id: "o1", code: "MP-0142" }],
              unchanged: [],
              failed: [{ id: "o2", code: "MP-0097", reason: "Está finalizada: solo puede volver a «En progreso»" }],
            }),
          )
        : new Response(JSON.stringify(PAGE)),
    );
    await act(async () => fireEvent.click(bar.getByRole("button", { name: "Pendiente de piezas" })));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/service-orders/bulk-status");
    expect(JSON.parse(init.body as string)).toEqual({ ids: ["o1", "o2"], status: "pendiente_piezas" });
    screen.getByText(
      "1 orden pasa a Pendiente de piezas. MP-0097 no: Está finalizada: solo puede volver a «En progreso».",
    );
    // What did not move stays picked.
    expect((screen.getByRole("checkbox", { name: "Seleccionar MP-0097" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Seleccionar MP-0142" }) as HTMLInputElement).checked).toBe(false);
  });

  it("writes what a batch did", () => {
    expect(
      bulkMessage({ changed: [], unchanged: [{ id: "a", code: "MP-1" }, { id: "b", code: "MP-2" }], failed: [] }, "En progreso"),
    ).toBe("Ninguna orden ha cambiado. 2 ya estaban así.");
    expect(
      bulkMessage(
        { changed: [{ id: "a", code: "MP-1" }, { id: "b", code: "MP-2" }], unchanged: [], failed: [{ id: "c", code: null, reason: "Orden no encontrada" }] },
        "En progreso",
      ),
    ).toBe("2 órdenes pasan a En progreso. Una orden no: Orden no encontrada.");
  });

  it("pages 50 at a time", async () => {
    respond({ ...PAGE, total: 120, page: 2 });
    await show();
    screen.getByText("51–100 de 120");
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(replace).toHaveBeenCalledWith("/ordenes?page=3", { scroll: false });
  });
});

describe("list query", () => {
  it("reads the address and ignores what it does not know", () => {
    expect(readQuery(new URLSearchParams("tab=nope&page=-3"))).toEqual({
      tab: "open",
      q: "",
      view: null,
      page: 1,
    });
    const q = readQuery(new URLSearchParams("tab=cancelado&q=ana&vista=uncollected&page=4"));
    expect(queryString(q)).toBe("tab=cancelado&q=ana&vista=uncollected&page=4");
    expect(queryString(q, true)).toBe("tab=cancelado&q=ana&view=uncollected&page=4");
    // The older link to «Con saldo pendiente» still works.
    expect(readQuery(new URLSearchParams("debt=true")).view).toBe("debt");
    expect(readQuery(new URLSearchParams("vista=nope")).view).toBeNull();
  });

  it("marks days in the shop from 7 and from 30", () => {
    expect([6, 7, 29, 30].map(daysLevel)).toEqual(["normal", "warning", "warning", "danger"]);
  });
});
