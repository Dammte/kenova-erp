import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { InvoiceImport } from "./InvoiceImport";
import { confirmBody, initialDecision, parseCost, reviewBlocker, tidyName, type ReviewLine } from "./invoiceImport";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const BAT = { id: "p1", sku: "BAT-IP13", name: "Batería iPhone 13", stock: 2, costPrice: "18.50" };
const A54 = { id: "p3", sku: "BAT-SGA54", name: "Batería Galaxy A54", stock: 0, costPrice: "14.20" };
const READ = {
  provider: "MovilParts",
  number: "F-2026-1184",
  invoiceDate: "2026-10-27",
  lines: [
    { description: "BATERIA IPHONE 13", ref: "MP-88213", quantity: 5, unitCost: "20" },
    { description: "BAT SAMSUNG A54 EB-BA546", ref: "RN-5541", quantity: 2, unitCost: "14.2" },
    { description: "FLEX BOTON HOME IPAD 9", ref: "MP-77024", quantity: 2, unitCost: "7.4" },
  ],
};
const PREVIEW = {
  duplicateOf: null,
  lines: [
    { match: { kind: "match", reason: "name", part: BAT }, waiting: [] },
    {
      match: { kind: "similar", score: 0.5, part: A54 },
      waiting: [{ partOrderId: "po1", orderId: "o9", orderCode: "MP-0129", quantity: 1 }],
    },
    { match: { kind: "new" }, waiting: [] },
  ],
};
const RESULT = {
  invoiceId: "i1",
  units: 9,
  cost: "143.20",
  lines: [
    { inventoryId: "p1", name: "Batería iPhone 13", created: false, stockBefore: 2, stockAfter: 7, costPrice: "19.57", received: [] },
    { inventoryId: "p3", name: "Batería Galaxy A54", created: false, stockBefore: 0, stockAfter: 2, costPrice: "14.20", received: [{ orderId: "o9", orderCode: "MP-0129" }] },
    { inventoryId: "n1", name: "Flex boton home ipad 9", created: true, stockBefore: 0, stockAfter: 2, costPrice: "7.40", received: [] },
  ],
};
const sent = (end: string) =>
  fetchMock.mock.calls.filter(([u]) => String(u).endsWith(end)).map(([, i]) => (i as RequestInit).body);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function readInvoice(preview: object = PREVIEW) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/read")) return json(READ);
    if (url.endsWith("/preview")) return json(preview);
    if (url.endsWith("/purchase-invoices")) return json(RESULT, 201);
    return json({}, 404);
  });
  render(<InvoiceImport onDone={() => {}} />);
  const file = new File(["%PDF-1.4"], "factura.pdf", { type: "application/pdf" });
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Archivo de la factura"), { target: { files: [file] } });
  });
}

describe("invoice import helpers", () => {
  it("decides only sure matches and writes a tidy name for new parts", () => {
    const l = READ.lines[0];
    expect(initialDecision(l, { kind: "match", reason: "ref", part: BAT })).toEqual({ to: "part", part: BAT });
    expect(initialDecision(l, { kind: "similar", score: 0.7, part: BAT })).toEqual({ to: "undecided" });
    expect(tidyName("FLEX BOTON HOME IPAD 9")).toBe("Flex boton home ipad 9");
    expect(parseCost("18,50 €")).toBe("18.5");
    expect(parseCost("abc")).toBeNull();
  });

  it("blocks the review until similar lines and a repeated invoice are decided", () => {
    const line = (d: ReviewLine["decision"]): ReviewLine => ({
      ...READ.lines[0],
      key: 0,
      match: { kind: "similar", score: 0.6, part: BAT },
      waiting: [],
      decision: d,
      qtyText: "5",
      costText: "20",
    });
    expect(reviewBlocker([line({ to: "undecided" })], false, false)).toBe("Resuelve la línea similar.");
    expect(reviewBlocker([line({ to: "part", part: BAT })], true, false)).toBe("Decide si importar otra vez esta factura.");
    expect(reviewBlocker([line({ to: "part", part: BAT })], true, true)).toBeUndefined();
    expect(reviewBlocker([{ ...line({ to: "part", part: BAT }), costText: "x" }], false, false)).toBe("Revisa los costes.");
    expect(
      confirmBody({ provider: " MovilParts ", number: "", invoiceDate: null }, [line({ to: "new", name: " Flex " })], false),
    ).toEqual({
      provider: "MovilParts",
      number: null,
      invoiceDate: null,
      allowDuplicate: false,
      lines: [{ description: "BATERIA IPHONE 13", ref: "MP-88213", quantity: 5, unitCost: "20", newPart: { name: "Flex" } }],
    });
  });
});

describe("InvoiceImport", () => {
  it("reads the invoice, asks about the similar line, confirms and shows what changed", async () => {
    await readInvoice();
    expect(JSON.parse(sent("/preview")[0] as string)).toMatchObject({ provider: "MovilParts", number: "F-2026-1184" });
    screen.getByText("3 líneas · 1 coinciden · 1 similares · 1 nuevo");
    const next = () => screen.getByRole("button", { name: "Revisar entrada" });
    expect(next().hasAttribute("disabled")).toBe(true);
    screen.getByText("Resuelve la línea similar.");

    const similar = screen.getByRole("row", { name: /BAT SAMSUNG A54/ });
    fireEvent.click(within(similar).getByRole("button", { name: "Es este" }));
    within(similar).getByText("1 orden esperando: MP-0129");
    fireEvent.change(screen.getByLabelText("Coste de BATERIA IPHONE 13"), { target: { value: "19,90" } });
    expect(next().hasAttribute("disabled")).toBe(false);
    fireEvent.click(next());

    screen.getByText("Confirmar entrada de stock");
    screen.getByText(/Esta factura cubre el pedido de/);
    expect(screen.getByText("Unidades en total").nextSibling?.textContent).toBe("9");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmar entrada" }));
    });
    const body = JSON.parse(sent("/purchase-invoices")[0] as string);
    expect(body.lines.map((l: { inventoryId?: string; newPart?: object; unitCost: string }) => [l.inventoryId, l.newPart, l.unitCost])).toEqual([
      ["p1", undefined, "19.9"],
      ["p3", undefined, "14.2"],
      [undefined, { name: "Flex boton home ipad 9" }, "7.4"],
    ]);
    expect(screen.getByRole("status").textContent).toContain("Stock actualizado");
    screen.getByText(/2 →/);
    expect(screen.getByRole("link", { name: "MP-0129" }).getAttribute("href")).toBe("/ordenes?orden=o9");
  });

  it("stops on a repeated invoice until it is confirmed as another entry", async () => {
    await readInvoice({ ...PREVIEW, duplicateOf: { importedAt: "2026-10-27T10:00:00Z", by: "Ana Rojo" } });
    screen.getByText(/La factura F-2026-1184 ya se importó el 27\/10\/2026 \(Ana Rojo\)/);
    fireEvent.click(screen.getByRole("button", { name: "Crear como nuevo" }));
    expect(screen.getByRole("button", { name: "Revisar entrada" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Sí, es otra entrada" }));
    expect(screen.getByRole("button", { name: "Revisar entrada" }).hasAttribute("disabled")).toBe(false);
  });

  it("offers typing the lines when the file cannot be read", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/read")
        ? json({ message: "La lectura con IA no está configurada. Puedes meter las líneas a mano." }, 503)
        : json(PREVIEW),
    );
    render(<InvoiceImport onDone={() => {}} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Archivo de la factura"), {
        target: { files: [new File(["x"], "f.pdf", { type: "application/pdf" })] },
      });
    });
    screen.getByRole("alert").textContent?.includes("a mano");
    fireEvent.click(screen.getByRole("button", { name: "Meter las líneas a mano" }));
    const go = () => screen.getByRole("button", { name: "Revisar líneas" });
    expect(go().hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "Amazon" } });
    fireEvent.change(screen.getByLabelText("Descripción de la línea 1"), { target: { value: "Adhesivo" } });
    fireEvent.change(screen.getByLabelText("Coste de la línea 1"), { target: { value: "0,90" } });
    await act(async () => {
      fireEvent.click(go());
    });
    expect(JSON.parse(sent("/preview")[0] as string)).toEqual({
      provider: "Amazon",
      number: null,
      lines: [{ description: "Adhesivo", ref: null, quantity: 1, unitCost: "0.9" }],
    });
  });
});
