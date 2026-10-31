import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { CashPage } from "./CashPage";
import { countDifferences, dayChip, shiftDate, type CashDay } from "./cash";

let role: "SUPER_ADMIN" | "STORE_ADMIN" = "STORE_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1", role, storeId: "vc" } }) }));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const DAY: CashDay = {
  store: { id: "vc", name: "Villarcayo", opensAt: "09:00", closesAt: "20:30" },
  date: "2026-10-30",
  status: "open",
  byMethod: {
    cash: { amount: "15.00", count: 2 },
    card: { amount: "129.00", count: 1 },
    transfer: { amount: "0.00", count: 0 },
    other: { amount: "0.00", count: 0 },
  },
  total: "144.00",
  cash: { float: "100.00", charges: "35.00", refunds: "-20.00", manual: "-12.50", expected: "102.50" },
  count: null,
  movements: [
    {
      id: "p1",
      kind: "charge",
      at: "2026-10-29T20:20:00Z",
      offHours: true,
      method: "card",
      amount: "129.00",
      note: null,
      orderId: "o1",
      orderCode: "VC-0031",
      clientName: "Jon Arana",
      userName: "Marta Ibáñez",
    },
    {
      id: "p2",
      kind: "refund",
      at: "2026-10-30T10:30:00Z",
      offHours: false,
      method: "cash",
      amount: "-20.00",
      note: "Devolución del diagnóstico",
      orderId: "o2",
      orderCode: "VC-0029",
      clientName: "Marta Ruiz",
      userName: "Marta Ibáñez",
    },
    {
      id: "m1",
      kind: "out",
      at: "2026-10-30T11:10:00Z",
      offHours: false,
      method: "cash",
      amount: "-12.50",
      note: "Compra de adhesivo",
      orderId: null,
      orderCode: null,
      clientName: null,
      userName: "Marta Ibáñez",
    },
  ],
};

beforeEach(() => {
  role = "STORE_ADMIN";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/cash/day?date=")) return json({ ...DAY, date: url.slice(-10), status: "closed", movements: [] });
    if (url.startsWith("/api/cash/day")) return json(DAY);
    if (url === "/api/cash/movements") return json({ id: "m2", date: DAY.date }, 201);
    if (url === "/api/cash/count") return json(DAY);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const plain = (lines: string[]) => lines.map((l) => l.replace(/\s/g, " "));

describe("cash helpers", () => {
  it("names the days and goes back in time", () => {
    expect(shiftDate("2026-11-01", 3)).toBe("2026-10-29");
    expect(dayChip("2026-10-30", "2026-10-30")).toBe("Hoy · vie 30/10");
    expect(dayChip("2026-10-29", "2026-10-30")).toBe("Jue 29/10");
  });

  it("explains count differences without judging", () => {
    expect(plain(countDifferences({ ...DAY, count: { cash: "101.00", terminal: "134.00", note: null, countedBy: null, countedAt: "" } }))).toEqual([
      "Faltan 1,50 € en efectivo.",
      "El datáfono marca 5,00 € más que los cobros con tarjeta.",
    ]);
    expect(plain(countDifferences({ ...DAY, count: { cash: "104.50", terminal: null, note: null, countedBy: null, countedAt: "" } }))).toEqual([
      "Sobran 2,00 € en efectivo.",
    ]);
  });
});

describe("CashPage", () => {
  it("shows the day's takings per method, the movements and the expected cash", async () => {
    render(<CashPage />);
    expect(await screen.findByText(/En curso · se cierra sola a las 20:30/)).toBeTruthy();
    const tiles = screen.getByLabelText("Cobrado por forma de pago");
    expect(within(tiles).getByText("144,00 €")).toBeTruthy();
    expect(within(tiles).getByText("129,00 €")).toBeTruthy();
    expect(screen.getByText(/Fuera de horario · cobrado el 29\/10 a las 21:20/)).toBeTruthy();
    expect(screen.getByText("Compra de adhesivo")).toBeTruthy();
    expect(screen.getByText("102,50 €")).toBeTruthy();
    // Only the store's own till: no store selector.
    expect(screen.queryByLabelText("Tienda")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Entradas y salidas · 1" }));
    expect(screen.queryByText("Jon Arana", { exact: false })).toBeNull();
  });

  it("records an exit only with amount and reason", async () => {
    render(<CashPage />);
    const button = await screen.findByRole("button", { name: "Anotar salida" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Escribe importe y motivo")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Importe"), { target: { value: "12,5" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Ferretería" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Anotar salida" }));
    });
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/cash/movements");
    expect(JSON.parse(call?.[1].body as string)).toEqual({ kind: "out", amount: 12.5, reason: "Ferretería" });
    expect(await screen.findByText("Salida de 12,50 € anotada")).toBeTruthy();
  });

  it("opens a closed day read-only", async () => {
    render(<CashPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Jue 29/10" }));
    expect(await screen.findByText(/no hubo cobros ni movimientos/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/cash/day?date=2026-10-29", expect.anything());
    expect(screen.queryByText("Entrada o salida")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar recuento" })).toBeNull();
  });

  it("lets a partner pick the store", async () => {
    role = "SUPER_ADMIN";
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/stores" ? json([{ id: "mp", name: "Medina" }, { id: "vc", name: "Villarcayo" }]) : json(DAY),
    );
    render(<CashPage />);
    fireEvent.change(await screen.findByLabelText("Tienda"), { target: { value: "vc" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/cash/day?storeId=vc", expect.anything());
  });

  it("offers a retry when the day cannot be loaded", async () => {
    fetchMock.mockImplementation(async () => json({}, 500));
    render(<CashPage />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/No se han podido cargar los movimientos/);
  });
});
