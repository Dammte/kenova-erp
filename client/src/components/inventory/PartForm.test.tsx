import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PartForm } from "./PartForm";
import { bodyFor, draftFrom, emptyDraft, suggestSku, validate, type PartData } from "./partForm";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const PART: PartData = {
  id: "p1",
  sku: "BAT-IP13",
  name: "Batería iPhone 13",
  description: null,
  category: "Baterías",
  brand: "Apple",
  model: "iPhone 13",
  ubication: "Estante B2",
  provider: "MovilParts",
  stock: 2,
  minimalStock: 3,
  salesPrice: "59.00",
  costPrice: "18.3333",
};
const SUGGEST = { categories: ["Baterías"], brands: ["Apple"], providers: ["MovilParts"] };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const field = (name: string) => screen.getByLabelText(new RegExp(`^${name}( \\*)?$`));

describe("part form logic", () => {
  it("suggests a SKU from the category and the name", () => {
    expect(suggestSku("Pantallas", "Pantalla iPhone 13 OLED")).toBe("PAN-IPHONE-13-OLED");
    expect(suggestSku("Baterías", "Batería Galaxy A54")).toBe("BAT-GALAXY-A54");
    expect(suggestSku("", "Adhesivo B-7000")).toBe("ADHESIVO-B-7000");
    expect(suggestSku("Otros", "Herramienta de apertura universal").length).toBeLessThanOrEqual(20);
  });

  it("says per field what stops the save", () => {
    expect(validate(emptyDraft())).toEqual({ name: "Escribe el nombre del repuesto.", sku: "Escribe un SKU o pulsa «Sugerir»." });
    const e = validate({ ...emptyDraft(), name: "X", sku: "X", stock: "-1", minimalStock: "1,5" });
    expect(e.stock).toBe("Escribe un número entero, 0 o más.");
    expect(e.minimalStock).toBe("Escribe un número entero, 0 o más.");
  });

  it("sends only what changed, and keeps the 4-decimal average cost unless it is retyped", () => {
    const d = draftFrom(PART);
    expect(bodyFor(d, PART)).toEqual({});
    expect(bodyFor({ ...d, ubication: "", minimalStock: "4" }, PART)).toEqual({ ubication: null, minimalStock: 4 });
    expect(bodyFor({ ...d, costPrice: 19 }, PART)).toEqual({ costPrice: "19" });
    expect(bodyFor({ ...d, stock: "5" }, PART)).toEqual({ stock: 5 });
    expect(bodyFor({ ...emptyDraft(), name: " Cola ", sku: "COLA" })).toEqual({
      name: "Cola",
      sku: "COLA",
      stock: 0,
      minimalStock: 0,
    });
  });
});

describe("PartForm", () => {
  it("creates a part and hands back its id", async () => {
    const onSaved = vi.fn();
    fetchMock.mockResolvedValue(json({ id: "new1" }, 201));
    render(<PartForm suggestions={SUGGEST} onSaved={onSaved} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));
    screen.getByText("Escribe el nombre del repuesto.");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(field("Nombre"), { target: { value: "Pantalla iPhone 13 OLED" } });
    fireEvent.change(field("Categoría"), { target: { value: "Pantallas" } });
    fireEvent.click(screen.getByRole("button", { name: "Sugerir" }));
    expect((field("SKU") as HTMLInputElement).value).toBe("PAN-IPHONE-13-OLED");
    fireEvent.change(field("Stock inicial"), { target: { value: "3" } });
    fireEvent.change(field("Precio de venta"), { target: { value: "89,90" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect([url, init.method]).toEqual(["/api/inventory", "POST"]);
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Pantalla iPhone 13 OLED",
      sku: "PAN-IPHONE-13-OLED",
      category: "Pantallas",
      stock: 3,
      minimalStock: 0,
      salesPrice: 89.9,
    });
    expect(onSaved).toHaveBeenCalledWith("new1");
  });

  it("says plainly when the SKU is taken", async () => {
    fetchMock.mockResolvedValue(json({ message: "duplicado" }, 409));
    render(<PartForm suggestions={SUGGEST} onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.change(field("Nombre"), { target: { value: "Batería" } });
    fireEvent.change(field("SKU"), { target: { value: "bat-ip13" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear repuesto" }));
    });
    screen.getByText("Ya hay un repuesto con el SKU BAT-IP13.");
  });

  it("edits a part, warns that a new stock is an adjustment and patches only the change", async () => {
    const onSaved = vi.fn();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? json({ id: "p1" }) : json(PART),
    );
    render(<PartForm id="p1" suggestions={SUGGEST} onSaved={onSaved} onCancel={() => {}} />);
    await act(async () => {});
    const form = screen.getByRole("complementary", { name: "Editar repuesto" });
    within(form).getByText("Editar repuesto · BAT-IP13");
    expect(within(form).getByRole("button", { name: /Guardar cambios/ }).hasAttribute("disabled")).toBe(true);
    within(form).getByText("No has cambiado nada");

    fireEvent.change(field("Stock"), { target: { value: "5" } });
    within(form).getByText("Se guarda como ajuste de +3 en los movimientos.");
    await act(async () => {
      fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    });
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect([url, init.method, JSON.parse(init.body as string)]).toEqual(["/api/inventory/p1", "PATCH", { stock: 5 }]);
    expect(onSaved).toHaveBeenCalledWith("p1");
  });
});
