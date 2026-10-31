import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TodayPage } from "./TodayPage";
import { ago, longDate, versusLastWeek, type TodaySummary } from "./today";

let role: "SUPER_ADMIN" | "STORE_ADMIN" = "SUPER_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1", role, storeId: null } }) }));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const SUMMARY: TodaySummary = {
  date: "2026-10-29",
  counts: {
    received: 6,
    receivedLastWeek: 4,
    inProgress: 12,
    inProgressUrgent: 3,
    waitingParts: 3,
    waitingPartsLate: 1,
    ready: 5,
    readyNotNotified: 0,
    collectedToday: "612.00",
    pendingBalance: "1284.50",
  },
  toNotify: { total: 0, rows: [] },
  lateParts: { total: 1, rows: [{ id: "o9", code: "MP-0129", clientName: "Rubén Castro", model: "Galaxy A54", days: 9 }] },
  uncollected: {
    total: 1,
    rows: [{ id: "o8", code: "MP-0088", clientName: "Raúl Ortiz", phone: "611 222 333", model: "iPhone 11", days: 44, balance: "59.00", notices: 2 }],
  },
  lowStock: { total: 1, rows: [{ id: "i1", sku: "PAN-IP13", name: "Pantalla iPhone 13", stock: 0, minimalStock: 2 }] },
  week: ["23", "24", "25", "26", "27", "28", "29"].map((d) => ({ day: `2026-10-${d}`, received: 4, delivered: 3 })),
  openByStatus: { en_progreso: 12, pendiente_cliente: 4, pendiente_piezas: 3, finalizado: 5 },
};

beforeEach(() => {
  role = "SUPER_ADMIN";
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/stores") return json([{ id: "mp", name: "Medina" }, { id: "vc", name: "Villarcayo" }]);
    if (url.startsWith("/api/today")) return json(SUMMARY);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("today helpers", () => {
  it("compares with the same weekday and writes the date", () => {
    expect(versusLastWeek(6, 4, "2026-10-29")).toBe("2 más que el jueves pasado");
    expect(versusLastWeek(2, 2, "2026-10-29")).toBe("Igual que el jueves pasado");
    expect(versusLastWeek(1, 3, "2026-10-29")).toBe("2 menos que el jueves pasado");
    expect(longDate("2026-10-29")).toBe("Jueves, 29/10/2026");
    expect([ago(0), ago(1), ago(3)]).toEqual(["hoy", "ayer", "hace 3 días"]);
  });
});

describe("TodayPage", () => {
  it("shows the day's figures and the lists to deal with", async () => {
    render(<TodayPage />);
    await act(async () => {});
    screen.getByText("Jueves, 29/10/2026");
    const stats = screen.getByRole("region", { name: "Cifras de hoy" });
    expect(within(stats).getByText("Recibidas hoy").nextSibling?.textContent).toBe("6");
    within(stats).getByText("2 más que el jueves pasado");
    within(stats).getByText("Todas avisadas");
    expect(within(stats).getByText("Cobrado hoy").nextSibling?.textContent).toMatch(/^612,00\s€$/);

    screen.getByText("Nada pendiente. Todas las órdenes finalizadas tienen aviso.");
    screen.getByText("MP-0129 · Rubén Castro · Galaxy A54");
    screen.getByText(/^44 días · debe 59,00\s€ · 2 avisos enviados$/);
    expect(screen.getByRole("link", { name: "Llamar" }).getAttribute("href")).toBe("tel:611222333");
    screen.getByText("Stock 0 · mín. 2");
    expect(screen.getByRole("listitem", { name: "Hoy: 4 entradas, 3 entregas" })).toBeTruthy();
  });

  it("lets a partner look at one store", async () => {
    render(<TodayPage />);
    await act(async () => {});
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "vc" } });
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/today?storeId=vc");
  });

  it("offers a retry when the panel does not load", async () => {
    role = "STORE_ADMIN";
    fetchMock.mockImplementation(async () => json({}, 500));
    render(<TodayPage />);
    await act(async () => {});
    screen.getByText(/No se ha podido cargar el panel/);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
