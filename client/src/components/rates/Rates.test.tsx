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

  it("leaves out withdrawn models, except the one the rate already has", () => {
    const models = [
      { id: "m8", name: "iPhone 8", brandId: "b1", active: false },
      { id: "m12", name: "iPhone 12", brandId: "b1", active: true },
    ];
    const brands = [{ id: "b1", name: "Apple" }];
    expect(modelOptions(models, brands).map((o) => o.id)).toEqual(["m12"]);
    expect(modelOptions(models, brands, "m8").map((o) => o.id)).toEqual(["m12", "m8"]);
  });
});

describe("RatesPage", () => {
  const fetchMock = vi.fn();
  const IPHONE = { id: "m2", name: "iPhone 13", brand: "Apple" };
  const SCREEN = row({ id: "r4", name: "Pantalla iPhone 13", category: "Pantalla", price: "149.00", model: IPHONE, quality: "compatible" });
  const CHECKUP = row({ id: "r5", name: "Revisión", category: null, price: "20.00", model: null });
  const ALL = [COMPATIBLE, ORIGINAL, CONNECTOR, SCREEN, CHECKUP];

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    role = "SUPER_ADMIN";
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const show = async (rows: RateRow[] = ALL) => {
    if (!fetchMock.getMockImplementation()) fetchMock.mockResolvedValue(new Response(JSON.stringify(rows)));
    render(<RatesPage />);
    await act(async () => {});
  };
  const filter = (text: string) =>
    fireEvent.change(screen.getByRole("searchbox", { name: "Filtrar tarifas" }), { target: { value: text } });
  const matrix = () => screen.getByRole("table", { name: "Tarifas por modelo y reparación" });
  const header = () => within(matrix()).getAllByRole("columnheader").map((h) => h.textContent);
  const models = () => within(matrix()).getAllByRole("rowheader").map((h) => h.textContent);

  it("shows the whole price list as models × repairs, with the stock for partners", async () => {
    await show();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/services/rates/all");
    expect(header()).toEqual(["Modelo", "Batería", "Conector de carga", "Pantalla", "Revisión"]);
    expect(models()).toEqual(["Galaxy A54Samsung", "iPhone 13Apple", "General"]);
    const battery = within(matrix()).getByRole("button", { name: /^Batería Galaxy A54: 55,00/ });
    expect(battery.textContent).toMatch(/55,00\s€stock 4/);
    // «Original» shows the other price, and its stock.
    fireEvent.click(screen.getByRole("radio", { name: "Original" }));
    expect(within(matrix()).getByRole("button", { name: /^Batería Galaxy A54: 79,00/ }).textContent).toContain("sin stock");
    // The screen has no original: it says so and keeps the compatible price.
    expect(within(matrix()).getByRole("button", { name: /^Pantalla iPhone 13: 149,00/ }).textContent).toContain("solo compatible");
    expect(within(matrix()).getAllByLabelText("No se hace").length).toBe(8);
  });

  it("filters the models by name or brand and the repairs by their name, without accents", async () => {
    await show();
    filter("bateria a54");
    expect(header()).toEqual(["Modelo", "Batería"]);
    expect(models()).toEqual(["Galaxy A54Samsung"]);
    filter("apple");
    expect(models()).toEqual(["iPhone 13Apple"]);
    filter("zzz");
    expect(screen.getByText(/Ninguna tarifa coincide con «zzz»/)).toBeTruthy();
  });

  it("opens the chosen cell with the WhatsApp text, the intake and the quote", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await show();
    filter("a54");
    const cell = within(matrix()).getByRole("button", { name: /^Batería Galaxy A54/ });
    fireEvent.click(cell);
    expect(cell.getAttribute("aria-pressed")).toBe("true");
    const chosen = screen.getByRole("region", { name: "Tarifa elegida" });
    expect(chosen.textContent).toContain("Batería · Galaxy A54");
    expect(chosen.textContent).toMatch(/55,00\s€En stock 4/);
    expect(chosen.textContent).toContain("Sin stock: se pide");
    const panel = within(chosen).getByRole("region", { name: "Texto para WhatsApp" });
    fireEvent.click(within(panel).getByRole("radio", { name: "Original" }));
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Copiar para WhatsApp" }));
    });
    expect(writeText.mock.calls[0][0]).toMatch(/79,00\s€ con pieza original/);
    expect(within(panel).getByRole("status").textContent).toBe("Copiado.");
    expect(within(panel).getByRole("link", { name: "Dar de alta" }).getAttribute("href")).toBe("/ordenes/nueva?servicio=r2");
    expect(within(panel).getByRole("link", { name: "Crear presupuesto" }).getAttribute("href")).toBe(
      "/presupuestos?presupuesto=nuevo&servicio=r2",
    );
    // The filter that found it is remembered.
    expect(screen.getByRole("button", { name: "a54" })).toBeTruthy();
  });

  it("lets a partner give a rate its model and quality, then loads the list again", async () => {
    const detail = { id: "r3", name: "Conector de carga Galaxy A54", category: "Conector de carga", price: "45.00", estimatedTime: "1 h", modelId: null, quality: null, inventoryId: null };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response(JSON.stringify(detail));
      if (url.endsWith("/services/r3")) return new Response(JSON.stringify(detail));
      if (url.endsWith("/models")) return new Response(JSON.stringify([{ id: "m1", name: "Galaxy A54", brandId: "b1" }]));
      if (url.endsWith("/brands")) return new Response(JSON.stringify([{ id: "b1", name: "Samsung" }]));
      if (url.endsWith("/inventory")) return new Response("[]");
      return new Response(JSON.stringify([{ ...CONNECTOR, model: null }]));
    });
    await show();
    fireEvent.click(within(matrix()).getByRole("button", { name: /^Conector de carga general/ }));
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
    expect(screen.queryByRole("form")).toBeNull();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/services/rates/all")).length).toBe(2);
  });

  it("lets a partner change prices in the matrix itself (decision 08)", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? new Response("{}") : new Response(JSON.stringify(ALL)),
    );
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Editar matriz" }));
    const field = screen.getByRole("textbox", { name: "Precio Batería Galaxy A54" }) as HTMLInputElement;
    expect(field.value).toBe("55,00");
    // Only the quality shown: the screen has no original, so it is not a field there.
    fireEvent.click(screen.getByRole("radio", { name: "Original" }));
    expect((screen.getByRole("textbox", { name: "Precio Batería Galaxy A54" }) as HTMLInputElement).value).toBe("79,00");
    expect(screen.queryByRole("textbox", { name: "Precio Pantalla iPhone 13" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Compatible" }));

    const battery = screen.getByRole("textbox", { name: "Precio Batería Galaxy A54" });
    fireEvent.change(battery, { target: { value: "abc" } });
    fireEvent.blur(battery);
    expect(screen.getByRole("alert").textContent).toBe("Precio no válido");
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "PATCH")).toBe(false);

    fireEvent.change(battery, { target: { value: "59,90" } });
    await act(async () => {
      fireEvent.keyDown(battery, { key: "Enter" });
    });
    const patch = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PATCH");
    expect(String(patch?.[0])).toContain("/services/r1");
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({ price: 59.9 });

    // An untouched cell is not saved on leaving it; Esc puts the price back.
    const screenPrice = screen.getByRole("textbox", { name: "Precio Pantalla iPhone 13" });
    fireEvent.blur(screenPrice);
    fireEvent.change(screenPrice, { target: { value: "1" } });
    fireEvent.keyDown(screenPrice, { key: "Escape" });
    expect((screenPrice as HTMLInputElement).value).toBe("149,00");
    expect(fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PATCH").length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Terminar edición" }));
    expect(within(matrix()).getByRole("button", { name: /^Batería Galaxy A54: 59,90/ })).toBeTruthy();
  });

  it("does not offer editing to a partner store", async () => {
    role = "STORE_ADMIN";
    await show([CONNECTOR]);
    expect(screen.queryByRole("button", { name: "Editar matriz" })).toBeNull();
    fireEvent.click(within(matrix()).getByRole("button", { name: /^Conector de carga/ }));
    expect(screen.queryByRole("button", { name: /^Editar/ })).toBeNull();
  });
});
