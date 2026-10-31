import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { OrderDetail, OrderPayment } from "@/components/orders/orderDetail";
import { Label } from "./Label";
import { Receipt } from "./Receipt";
import { readFormat } from "./ReceiptPage";
import { clientName, receiptMoney, storeLines, type ReceiptStore } from "./receipt";

afterEach(cleanup);

const ORDER: OrderDetail = {
  id: "o1",
  code: "MP-0142",
  status: "en_progreso",
  priority: "medium",
  createdAt: "2026-10-29T09:57:00Z",
  finishedAt: null,
  deliveredAt: null,
  reportedFaults: ["broken_screen"],
  faultNotes: "Táctil no responde abajo.",
  physicalCondition: "Rayas en el marco",
  accessories: "Funda",
  observations: "Nota interna que no se imprime",
  totalPrice: "149.00",
  amountPaid: "59.00",
  balance: "90.00",
  paymentStatus: "paid_partial",
  cancelReason: null,
  workDone: null,
  warrantyOfId: null,
  storeId: "s1",
  waivesQuote: false,
  client: {
    id: "c1",
    firstName: "Lucía",
    lastName: "Fernández Ortega",
    dniType: "NIF",
    dni: "12345678Z",
    email: "lucia@correo.es",
    phoneNumber: "612 345 678",
    preferredContact: "PHONE",
  },
  device: { id: "d1", type: "movil", brand: "Apple", model: "iPhone 13", imei: "356789104521337", unlockSecretType: "CODE" },
  lines: [{ id: "l1", kind: "service", description: "Cambio de pantalla", unitPrice: "149.00", quantity: 1 }],
  serviceHistory: [],
};
const PAYMENTS: OrderPayment[] = [
  { id: "p1", kind: "charge", amount: "59.00", method: "card", note: null, createdAt: "2026-10-29T09:58:00Z", createdBy: null },
];
const STORE: ReceiptStore = {
  id: "s1",
  name: "Kenova Medina de Pomar",
  city: "Medina de Pomar",
  address: "C/ Mayor 1",
  phone: "947 000 000",
  legalName: null,
  taxId: "B12345678",
  warrantyDays: 90,
};

describe("receipt helpers", () => {
  it("leaves out store data that is empty", () => {
    expect(storeLines(STORE, "a4")).toEqual(["NIF B12345678", "C/ Mayor 1 · Tel. 947 000 000"]);
    expect(storeLines({ ...STORE, address: null, phone: null, taxId: null }, "a4")).toEqual([]);
    expect(storeLines(STORE, "ticket")).toEqual(["C/ Mayor 1 · Tel. 947 000 000"]);
  });
  it("adds up the money and names how it was paid", () => {
    expect(receiptMoney(ORDER, PAYMENTS)).toEqual({ total: 149, paid: 59, pending: 90, methods: ["Tarjeta"] });
  });
  it("shortens the surnames on the ticket only", () => {
    expect(clientName(ORDER.client, "ticket")).toBe("Lucía Fernández O.");
    expect(clientName(ORDER.client, "a4")).toBe("Lucía Fernández Ortega");
  });
});

describe("Receipt", () => {
  it("prints the order, the money and the quote, never the unlock code or internal notes", () => {
    render(<Receipt order={ORDER} payments={PAYMENTS} store={STORE} format="ticket" />);
    const text = screen.getByRole("article", { name: "Resguardo" }).textContent ?? "";
    expect(text).toContain("MP-0142");
    expect(text).toContain("Resguardo de depósito");
    expect(text).toContain("Uso interno · no es factura");
    expect(text).toContain("Pantalla rota");
    expect(text).toMatch(/A cuenta \(tarjeta\)59,00\s€/);
    expect(text).toMatch(/Pendiente90,00\s€/);
    expect(text).toContain("Presupuesto válido durante 30 días");
    expect(text).toContain("Garantía de la reparación: 90 días");
    expect(text).toContain("Código de desbloqueo: registrado (no se imprime).");
    expect(text).not.toContain("Nota interna");
    expect(text).not.toContain("12345678Z");
    // Leaving the device is the consent: no signature lines on paper.
    expect(text).not.toContain("Firma");
  });

  it("on A4 adds the client's id and the waiver instead of the quote", () => {
    render(<Receipt order={{ ...ORDER, waivesQuote: true }} payments={PAYMENTS} store={STORE} format="a4" />);
    const text = screen.getByRole("article", { name: "Resguardo" }).textContent ?? "";
    expect(text).toContain("NIF 12345678Z");
    expect(text).toContain("El cliente renuncia al presupuesto previo.");
    expect(text).not.toContain("Presupuesto válido");
    expect(text).not.toContain("Por Kenova");
  });
});

describe("Label", () => {
  it("shows the code, its barcode, the device and the client, never the unlock code or prices", () => {
    render(<Label order={ORDER} />);
    const text = screen.getByRole("article", { name: "Etiqueta" }).textContent ?? "";
    expect(text).toContain("MP-0142");
    expect(text).toContain("29/10/26");
    expect(screen.getByRole("img", { name: "Código de barras MP-0142" })).toBeTruthy();
    expect(text).toContain("Apple iPhone 13 · Pantalla rota");
    expect(text).toContain("Lucía Fernández O. · 612 345 678");
    expect(text).not.toMatch(/desbloqueo|€/);
  });

  it("opens from ?formato=etiqueta and otherwise keeps the receipt paper", () => {
    expect(readFormat("?formato=etiqueta")).toBe("label");
    expect(readFormat("")).toBe("ticket");
  });
});
