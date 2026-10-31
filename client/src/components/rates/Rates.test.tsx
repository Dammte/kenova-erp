import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RatesPage } from "./RatesPage";
import { modelOptions } from "./RateEditor";

let role: "SUPER_ADMIN" | "STORE_ADMIN" = "SUPER_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", role } }),
}));
import { choicesFor, groupRates, pushRecent, whatsappText, type RateRow } from "./rates";

const A54 = { id: "m1", name: "Galaxy A54", brand: "Samsung" };
const row = (over: Partial<RateRow>): RateRow => ({
  id: "x",
  name: "Batería Galaxy A54",
  category: "Batería",
  price: "55.00",
  estimatedTime: "1 h",
  quality: null,
  model: A54,
  stock: null,
  ...over,
});
const COMPATIBLE = row({ id: "r1", quality: "compatible", stock: { units: 4, low: false } });
const ORIGINAL = row({ id: "r2", quality: "original", price: "79.00", stock: { units: 0, low: true } });
const CONNECTOR = row({ id: "r3", name: "Conector de carga Galaxy A54", category: "Conector de carga", price: "45.00" });

describe("rates helpers", () => {
  it("puts compatible and original of the same repair and model together", () => {
    const groups = groupRates([COMPATIBLE, ORIGINAL, CONNECTOR]);
    expect(groups.map((g) => [g.repair, g.compatible?.id, g.original?.id, g.single?.id])).toEqual([
      ["Batería", "r1", "r2", undefined],
      ["Conector de carga", undefined, undefined, "r3"],
    ]);
    expect(choicesFor(groups[0])).toEqual(["both", "compatible", "original"]);
    expect(choicesFor(groups[1])).toEqual([]);
  });

  it("writes the WhatsApp text with the price asked for, and «hoy» only when the part is in stock", () => {
    const [battery, connector] = groupRates([COMPATIBLE, ORIGINAL, CONNECTOR]);
    expect(whatsappText(battery, "both")).toMatch(
      /^Hola, te paso el precio para tu Galaxy A54: batería, 55,00\s€ con pieza compatible o 79,00\s€ con original\. Tiempo estimado: 1 h\. Tenemos la pieza: puede estar hoy\.\nPrecio válido 30 días\.\nKenova$/,
    );
    expect(whatsappText(battery, "original")).not.toContain("puede estar hoy");
    expect(whatsappText(battery, "original")).toMatch(/79,00\s€ con pieza original/);
    expect(whatsappText(connector, "compatible")).toMatch(/^Hola, te paso el precio para tu Galaxy A54: conector de carga, 45,00\s€\./);
  });

  it("remembers five recent searches, newest first and without repeats", () => {
    let list: string[] = [];
    for (const q of ["a", "uno", "dos", "tres", "cuatro", "cinco", "DOS"]) list = pushRecent(list, q);
    expect(list).toEqual(["DOS", "cinco", "cuatro", "tres", "uno"]);
  });

  it("names models with their brand and sorts them for the select", () => {
    expect(
      modelOptions(
        [
          { id: "m2", name: "iPhone 12", brandId: "b1" },
          { id: "m1", name: "Galaxy A54", brandId: "b2" },
          { id: "m3", name: "Genérico", brandId: null },
        ],
        [
          { id: "b1", name: "Apple" },
          { id: "b2", name: "Samsung" },
        ],
      ).map((o) => o.label),
    ).toEqual(["Apple iPhone 12", "Genérico", "Samsung Galaxy A54"]);
  });
});

describe("RatesPage", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    role = "SUPER_ADMIN";
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const type = async (text: string) => {
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar tarifa" }), { target: { value: text } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
  };

  it("searches once typing stops and shows each repair with its prices and stock", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([COMPATIBLE, ORIGINAL])));
    render(<RatesPage />);
    await type("bateria a54");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/services/rates?q=bateria%20a54");
    const card = screen.getByRole("listitem");
    expect(card.textContent).toContain("Galaxy A54");
    expect(card.textContent).toMatch(/55,00\s€En stock 4/);
    expect(card.textContent).toContain("Sin stock: se pide");
    expect(screen.getByRole("button", { name: "bateria a54" })).toBeTruthy();
  });

  it("opens the WhatsApp text and copies the chosen price", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    fetchMock.mockResolvedValue(new Response(JSON.stringify([COMPATIBLE, ORIGINAL])));
    render(<RatesPage />);
    await type("bateria a54");
    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    const panel = screen.getByRole("region", { name: "Texto para WhatsApp" });
    fireEvent.click(within(panel).getByRole("radio", { name: "Original" }));
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Copiar para WhatsApp" }));
    });
    expect(writeText.mock.calls[0][0]).toMatch(/79,00\s€ con pieza original/);
    expect(screen.getByRole("status").textContent).toBe("Copiado.");
  });

  it("says when nothing matches and does not search one letter", async () => {
    fetchMock.mockResolvedValue(new Response("[]"));
    render(<RatesPage />);
    await type("x");
    expect(fetchMock).not.toHaveBeenCalled();
    await type("zzz");
    expect(screen.getByText(/Ninguna tarifa coincide con «zzz»/)).toBeTruthy();
  });

  it("lets a partner give a rate its model and quality, then searches again", async () => {
    const detail = { id: "r3", name: "Conector de carga Galaxy A54", category: "Conector de carga", price: "45.00", estimatedTime: "1 h", modelId: null, quality: null, inventoryId: null };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(JSON.stringify(detail));
      if (url.endsWith("/services/r3")) return new Response(JSON.stringify(detail));
      if (url.endsWith("/models")) return new Response(JSON.stringify([{ id: "m1", name: "Galaxy A54", brandId: "b1" }]));
      if (url.endsWith("/brands")) return new Response(JSON.stringify([{ id: "b1", name: "Samsung" }]));
      if (url.endsWith("/inventory")) return new Response("[]");
      return new Response(JSON.stringify([{ ...CONNECTOR, model: null }]));
    });
    render(<RatesPage />);
    await type("conector");
    fireEvent.click(screen.getByRole("button", { name: "Editar Conector de carga Galaxy A54" }));
    await act(async () => {});
    const form = screen.getByRole("form", { name: "Editar Conector de carga Galaxy A54" });
    fireEvent.change(within(form).getByRole("combobox", { name: "Modelo" }), { target: { value: "m1" } });
    fireEvent.click(within(form).getByRole("radio", { name: "Compatible" }));
    await act(async () => {
      fireEvent.click(within(form).getByRole("button", { name: "Guardar" }));
    });
    const patch = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PATCH");
    expect(String(patch?.[0])).toContain("/services/r3");
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toMatchObject({
      modelId: "m1",
      quality: "compatible",
      inventoryId: null,
      price: 45,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByRole("form")).toBeNull();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/services/rates")).length).toBe(2);
  });

  it("does not offer editing to a partner store", async () => {
    role = "STORE_ADMIN";
    fetchMock.mockResolvedValue(new Response(JSON.stringify([CONNECTOR])));
    render(<RatesPage />);
    await type("conector");
    expect(screen.queryByRole("button", { name: /^Editar/ })).toBeNull();
  });
});
