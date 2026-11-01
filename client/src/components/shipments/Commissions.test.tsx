import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { SessionUser } from "@/components/auth/AuthProvider";
import {
  currentMonth,
  monthLabel,
  shiftMonth,
  type CommissionMonth,
} from "./Commissions";
import { pendingText, today } from "./Settlement";
import { ShipmentsPage } from "./ShipmentsPage";

const replace = vi.fn();
let search = "";
let user: SessionUser;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/envios",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user }),
}));

const SUPER: SessionUser = {
  id: "u1",
  email: "ana@kenova.es",
  fullName: "Ana Rojo",
  role: "SUPER_ADMIN",
  storeId: null,
  mustChangePassword: false,
};
const STORE: SessionUser = { ...SUPER, role: "STORE_ADMIN", storeId: "s2" };

const OCTOBER: CommissionMonth = {
  month: "2026-10",
  store: { id: "s2", name: "Villarcayo" },
  lines: [
    {
      orderId: "o36",
      orderCode: "VC-0036",
      deliveredAt: "2026-10-12T10:00:00Z",
      clientName: "Iker Bárcena",
      device: "Apple iPhone 13",
      amountPaid: "129.00",
      commissionType: "percent",
      commissionValue: "15.00",
      commissionAmount: "19.35",
      warranty: false,
    },
    {
      orderId: "o40",
      orderCode: "VC-0040",
      deliveredAt: "2026-10-20T10:00:00Z",
      clientName: "Sonia Gil",
      device: null,
      amountPaid: "0.00",
      commissionType: "percent",
      commissionValue: "15.00",
      commissionAmount: "0.00",
      warranty: true,
    },
  ],
  collected: "129.00",
  commission: "19.35",
  toKenova: "109.65",
  carriedIn: "0.00",
  due: "109.65",
  settlement: null,
};
const SETTLED: CommissionMonth = {
  ...OCTOBER,
  carriedIn: "20.00",
  due: "129.65",
  settlement: {
    id: "l1",
    month: "2026-10",
    toKenova: "109.65",
    carriedIn: "20.00",
    due: "129.65",
    received: "100.00",
    pending: "29.65",
    receivedOn: "2026-11-03",
    method: "transfer",
    note: "Falta el ticket de VC-0040",
    createdBy: { id: "u1", fullName: "Ana Rojo" },
  },
};

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  search = "vista=comisiones&mes=2026-10";
  user = SUPER;
  replace.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/stores")
      return json([
        { id: "s1", name: "Medina de Pomar", isMain: true },
        { id: "s2", name: "Villarcayo", isMain: false },
        { id: "s3", name: "Espinosa", isMain: false },
      ]);
    if (url.includes("/commissions")) return json(OCTOBER);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function show() {
  render(<ShipmentsPage />);
  await act(async () => {});
  await act(async () => {});
}
const calls = () => fetchMock.mock.calls.map((c) => c[0] as string);
const money = (text: string | null) => text?.replace(/\s/g, " ");

describe("Comisiones", () => {
  it("is a tab of Envíos", async () => {
    await show();
    expect(
      screen
        .getByRole("link", { name: "Comisiones" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Envíos" }).getAttribute("href"),
    ).toBe("/envios");
  });

  it("shows the partners the month of the first partner store, with its totals", async () => {
    await show();
    expect(calls()).toContain("/api/stores/s2/commissions?month=2026-10");
    const region = screen.getByRole("region", { name: "Comisiones" });
    expect(within(region).getByLabelText("Tienda")).toBeTruthy();
    within(region).getByText("octubre de 2026");
    const totals = within(region)
      .getAllByRole("definition")
      .map((d) => money(d.textContent));
    expect(totals).toEqual(["129,00 €", "19,35 €", "109,65 €"]);
    within(region).getByText("Comisión de Villarcayo");

    const [first, second] = within(region).getAllByRole("row").slice(1);
    within(first).getByText("15 %");
    expect(
      within(first).getByRole("link", { name: "VC-0036" }).getAttribute("href"),
    ).toBe("/ordenes?orden=o36");
    within(second).getByText("garantía");
  });

  it("changes store and month in the address", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Tienda"), {
      target: { value: "s3" },
    });
    expect(replace).toHaveBeenCalledWith(
      "/envios?vista=comisiones&tienda=s3&mes=2026-10",
      {
        scroll: false,
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(replace).toHaveBeenLastCalledWith(
      "/envios?vista=comisiones&tienda=s2&mes=2026-09",
      {
        scroll: false,
      },
    );
  });

  it("a store sees its own month, without choosing a store", async () => {
    user = STORE;
    await show();
    expect(calls()).toEqual(["/api/stores/s2/commissions?month=2026-10"]);
    expect(screen.queryByLabelText("Tienda")).toBeNull();
  });

  it("an empty month says why there is no commission", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/stores"
        ? json([{ id: "s2", name: "Villarcayo", isMain: false }])
        : json({
            ...OCTOBER,
            lines: [],
            collected: "0.00",
            commission: "0.00",
            toKenova: "0.00",
          }),
    );
    await show();
    screen.getByText(
      "Este mes aún no hay órdenes entregadas, así que no hay comisión.",
    );
  });

  it("says what the server answers when there is nothing to show", async () => {
    user = { ...STORE, storeId: "s1" };
    fetchMock.mockImplementation(async () =>
      json({ message: "La tienda principal no lleva comisión" }, 400),
    );
    await show();
    screen.getByText("La tienda principal no lleva comisión");
  });
});

describe("Liquidación", () => {
  /** Answers the month with `month`, and settlement calls with `answer`. */
  function api(month: CommissionMonth, answer = json({}, 201)) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/stores")
        return json([{ id: "s2", name: "Villarcayo", isMain: false }]);
      if (url.endsWith("/settlement")) {
        return init?.method === "DELETE"
          ? new Response(null, { status: 204 })
          : answer;
      }
      return json(month);
    });
  }
  const monthCalls = () => calls().filter((u) => u.includes("?month="));

  it("the partners record what the store handed over; the rest carries to next month", async () => {
    api(OCTOBER);
    await show();
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar liquidación" }),
    );
    const form = screen.getByRole("form", { name: "Registrar liquidación" });
    const amount = within(form).getByLabelText(
      "Ha entregado",
    ) as HTMLInputElement;
    expect(amount.value).toBe("109,65");
    fireEvent.change(amount, { target: { value: "80" } });
    within(form).getByText(
      "Quedan 29,65 € pendientes: se suman a la próxima liquidación.",
      { normalizer: (t) => t.replace(/\s/g, " ") },
    );
    fireEvent.change(within(form).getByLabelText("Forma de pago"), {
      target: { value: "cash" },
    });
    fireEvent.change(within(form).getByLabelText("Nota · opcional"), {
      target: { value: " En mano " },
    });
    fireEvent.submit(form);
    await act(async () => {});
    const [url, init] = fetchMock.mock.calls.find((c) =>
      (c[0] as string).endsWith("/settlement"),
    ) as [string, RequestInit];
    expect(url).toBe("/api/stores/s2/commissions/2026-10/settlement");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      received: 80,
      receivedOn: today(),
      method: "cash",
      note: "En mano",
    });
    // The month reloads with its settlement.
    expect(monthCalls()).toHaveLength(2);
  });

  it("says why the server refuses it and keeps the form", async () => {
    api(
      OCTOBER,
      json({ message: "Ya hay una liquidación de un mes posterior" }, 400),
    );
    await show();
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar liquidación" }),
    );
    fireEvent.submit(
      screen.getByRole("form", { name: "Registrar liquidación" }),
    );
    await act(async () => {});
    screen.getByText("Ya hay una liquidación de un mes posterior");
    screen.getByRole("form", { name: "Registrar liquidación" });
  });

  it("adds what was left pending to what the store has to hand over", async () => {
    api({ ...OCTOBER, carriedIn: "20.00", due: "129.65" });
    await show();
    const totals = screen
      .getAllByRole("definition")
      .map((d) => money(d.textContent));
    expect(totals).toEqual([
      "129,00 €",
      "19,35 €",
      "109,65 €",
      "20,00 €",
      "129,65 €",
    ]);
    screen.getByText("Saldo de meses anteriores");
  });

  it("a settled month says what was handed over, and the partners can undo it", async () => {
    api(SETTLED);
    await show();
    const box = screen.getByRole("region", { name: "Liquidación" });
    expect(money(box.textContent)).toContain(
      "Villarcayo entregó 100,00 € de 129,65 € el 03/11/2026 · Transferencia · Anotado por Ana Rojo",
    );
    within(box).getByText(
      "Quedan 29,65 € pendientes: se suman a la próxima liquidación.",
      { normalizer: (t) => t.replace(/\s/g, " ") },
    );
    within(box).getByText("Falta el ticket de VC-0040");
    expect(
      screen.queryByRole("button", { name: "Registrar liquidación" }),
    ).toBeNull();

    fireEvent.click(
      within(box).getByRole("button", { name: "Deshacer liquidación" }),
    );
    const ask = within(box).getByRole("alertdialog");
    expect(calls().some((u) => u.endsWith("/settlement"))).toBe(false);
    fireEvent.click(
      within(ask).getByRole("button", { name: "Deshacer liquidación" }),
    );
    await act(async () => {});
    const undo = fetchMock.mock.calls.find((c) =>
      (c[0] as string).endsWith("/settlement"),
    ) as [string, RequestInit];
    expect(undo[1].method).toBe("DELETE");
    expect(monthCalls()).toHaveLength(2);
  });

  it("a store sees its settlement read only, and what it still owes", async () => {
    user = STORE;
    api(SETTLED);
    await show();
    screen.getByRole("region", { name: "Liquidación" });
    expect(
      screen.queryByRole("button", { name: "Deshacer liquidación" }),
    ).toBeNull();
    cleanup();
    api(OCTOBER);
    await show();
    expect(
      screen.queryByRole("button", { name: "Registrar liquidación" }),
    ).toBeNull();
    screen.getByText("Pendiente de liquidar: 109,65 € a entregar a Kenova.", {
      normalizer: (t) => t.replace(/\s/g, " "),
    });
  });

  it("the month in progress cannot be settled yet", async () => {
    search = `vista=comisiones&mes=${currentMonth()}`;
    api({ ...OCTOBER, month: currentMonth() });
    await show();
    screen.getByText(
      `${monthLabel(currentMonth())} se podrá liquidar cuando termine el mes.`,
    );
    expect(
      screen.queryByRole("button", { name: "Registrar liquidación" }),
    ).toBeNull();
  });

  it("names what is left for next month", () => {
    const n = (t: string) => t.replace(/\s/g, " ");
    expect(n(pendingText("0.00"))).toBe(
      "Liquidado del todo: no queda nada pendiente.",
    );
    expect(n(pendingText("-5.00"))).toBe(
      "La tienda entregó 5,00 € de más: se descuentan de la próxima liquidación.",
    );
  });
});

describe("months", () => {
  it("names, moves and reads months", () => {
    expect(monthLabel("2026-10")).toBe("octubre de 2026");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    // 23:30 UTC on 31 October is already November in Madrid.
    expect(currentMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });
});
