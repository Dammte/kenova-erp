import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import OrderList from "./OrderList";
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
    row.getByText("Pantalla rota, Batería");
    row.getByText("Cambio de pantalla");
    expect(row.getByText("+2").getAttribute("title")).toBe("Cambio de pantalla\nBatería\nLimpieza");
    row.getByText("Urgente");
    row.getByText("Pago parcial");
    row.getByText("Debe 90,00 €");
    row.getByLabelText("40 días en taller");
    within(second).getByText("sin recoger");
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
    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar" }));
    expect(replace).toHaveBeenCalledWith("/ordenes", { scroll: false });
  });

  it("asks for what the address says and changes tab from page 1", async () => {
    search = "tab=finalizado&debt=true&page=2";
    await show();
    expect(requested()).toBe("/api/service-orders/list?tab=finalizado&debt=true&page=2");
    fireEvent.click(screen.getByRole("button", { name: /Entregadas/ }));
    expect(replace).toHaveBeenCalledWith("/ordenes?tab=entregado&debt=true", { scroll: false });
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
    screen.getByText("Ninguna orden coincide con «galaxy s9» y el filtro «Con saldo pendiente».");
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
      debt: false,
      page: 1,
    });
    const q = readQuery(new URLSearchParams("tab=cancelado&q=ana&debt=true&page=4"));
    expect(queryString(q)).toBe("tab=cancelado&q=ana&debt=true&page=4");
  });

  it("marks days in the shop from 7 and from 30", () => {
    expect([6, 7, 29, 30].map(daysLevel)).toEqual(["normal", "warning", "warning", "danger"]);
  });
});
