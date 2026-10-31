import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QuotesPage } from "./QuotesPage";
import { daysLeft, formatDay, linesTotal, validityText, type QuoteDetail, type QuoteListPage } from "./quotes";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/presupuestos",
  useSearchParams: () => new URLSearchParams(search),
}));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const LIST: QuoteListPage = {
  rows: [
    {
      id: "q1",
      code: "MP-P0031",
      status: "sent",
      clientName: "Aitor Etxeberria",
      clientPhone: "688 450 117",
      device: "Apple MacBook Air M1",
      total: "435.00",
      validUntil: "2026-11-27",
      createdAt: "2026-10-28T10:00:00Z",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
  counts: { all: 1, draft: 0, sent: 1, accepted: 0, rejected: 0, expired: 0 },
};

const DETAIL: QuoteDetail = {
  id: "q1",
  code: "MP-P0031",
  status: "sent",
  clientId: null,
  clientName: "Aitor Etxeberria",
  clientPhone: "688 450 117",
  brand: "Apple",
  model: "MacBook Air M1",
  fault: "Daño por líquido",
  total: "435.00",
  diagnosticFee: "20.00",
  validUntil: "2026-11-27",
  sentAt: "2026-10-28T10:05:00Z",
  decidedAt: null,
  createdAt: "2026-10-28T10:00:00Z",
  createdBy: { fullName: "Daniel" },
  order: null,
  lines: [
    { id: "l1", serviceId: null, description: "Reparación de placa base", quality: null, unitPrice: "380.00" },
    { id: "l2", serviceId: "s1", description: "Limpieza por líquido", quality: "original", unitPrice: "55.00" },
  ],
};

beforeEach(() => {
  search = "";
  replace.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("quote helpers", () => {
  it("counts the days left in Spain and words the validity", () => {
    expect(daysLeft("2026-11-27", "2026-10-29")).toBe(29);
    expect(formatDay("2026-11-27")).toBe("27/11/2026");
    expect(validityText({ status: "sent", validUntil: "2026-11-27" }, "2026-10-29")).toBe(
      "Válido hasta 27/11/2026 · 29 días",
    );
    expect(validityText({ status: "sent", validUntil: "2026-11-27" }, "2026-11-27")).toContain("último día");
    expect(validityText({ status: "expired", validUntil: "2026-10-01" })).toBe("Caducó el 01/10/2026");
  });

  it("adds the lines in cents", () => {
    expect(linesTotal([{ unitPrice: 0.1 }, { unitPrice: 0.2 }, { unitPrice: null }])).toBe(0.3);
  });
});

describe("QuotesPage", () => {
  it("lists the quotes with their counts and opens one beside the list", async () => {
    search = "presupuesto=q1";
    fetchMock.mockImplementation(async (url: string) => (url.endsWith("/quotes/q1") ? json(DETAIL) : json(LIST)));
    render(<QuotesPage />);
    await act(async () => {});

    expect(screen.getByRole("button", { name: /Enviado\s*1/ })).toBeTruthy();
    const list = screen.getByRole("region", { name: "Lista de presupuestos" });
    expect(within(list).getByText("Aitor Etxeberria")).toBeTruthy();

    const detail = screen.getByRole("article", { name: "Presupuesto MP-P0031" });
    expect(within(detail).getByText("Reparación de placa base")).toBeTruthy();
    expect(within(detail).getByText("Original")).toBeTruthy();
    expect(within(detail).getByText(/Si no se acepta, se cobra el diagnóstico \(20,00\s€\)/)).toBeTruthy();
    // Only a draft can be edited.
    expect(within(detail).queryByRole("button", { name: "Editar" })).toBeNull();

    fireEvent.click(within(list).getByRole("button", { name: /MP-P0031/ }));
    expect(replace).toHaveBeenCalledWith("/presupuestos?presupuesto=q1", { scroll: false });
  });

  it("says how to start when there are none", async () => {
    fetchMock.mockImplementation(async () =>
      json({ ...LIST, rows: [], total: 0, counts: { ...LIST.counts, all: 0, sent: 0 } }),
    );
    render(<QuotesPage />);
    await act(async () => {});
    expect(screen.getByText("Aún no hay presupuestos")).toBeTruthy();
  });

  it("creates a draft from a rate and a free line", async () => {
    vi.useFakeTimers();
    search = "presupuesto=nuevo";
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/services/rates"))
        return json([
          { id: "s9", name: "Batería Galaxy A54", price: "55.00", quality: "compatible", model: null },
        ]);
      if (init?.method === "POST") return json({ ...DETAIL, id: "q7", status: "draft" }, 201);
      return json(LIST);
    });
    render(<QuotesPage />);
    await act(async () => {});
    const form = screen.getByRole("form", { name: "Nuevo presupuesto" });
    const create = () => within(form).getByRole("button", { name: "Crear borrador" }) as HTMLButtonElement;
    expect(create().disabled).toBe(true);
    expect(create().getAttribute("aria-describedby")).toBeTruthy();

    fireEvent.change(within(form).getByLabelText(/^Nombre/), { target: { value: "Lucía" } });
    fireEvent.change(within(form).getByLabelText(/^Teléfono/), { target: { value: "612 345 678" } });
    fireEvent.change(within(form).getByLabelText(/^Modelo/), { target: { value: "Galaxy A54" } });
    fireEvent.change(within(form).getByLabelText("Añadir tarifa"), { target: { value: "bateria a54" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    fireEvent.click(within(form).getByRole("button", { name: /Batería Galaxy A54/ }));
    fireEvent.click(within(form).getByRole("button", { name: "Línea libre" }));
    fireEvent.change(within(form).getByLabelText("Concepto 2"), { target: { value: "Protector" } });
    fireEvent.change(within(form).getByLabelText("Importe 2"), { target: { value: "9,90" } });
    expect(within(form).getByLabelText("Total del presupuesto").textContent).toMatch(/64,90\s€/);

    await act(async () => {
      fireEvent.click(create());
    });
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/quotes");
    expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({
      clientName: "Lucía",
      clientPhone: "612 345 678",
      brand: null,
      model: "Galaxy A54",
      fault: null,
      diagnosticFee: null,
      lines: [
        { serviceId: "s9", description: "Batería Galaxy A54", quality: "compatible", unitPrice: 55 },
        { serviceId: null, description: "Protector", quality: null, unitPrice: 9.9 },
      ],
    });
    expect(replace).toHaveBeenCalledWith("/presupuestos?presupuesto=q7", { scroll: false });
    vi.useRealTimers();
  });
});
