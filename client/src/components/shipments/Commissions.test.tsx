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

describe("months", () => {
  it("names, moves and reads months", () => {
    expect(monthLabel("2026-10")).toBe("octubre de 2026");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    // 23:30 UTC on 31 October is already November in Madrid.
    expect(currentMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });
});
