import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import OrderPage, { editHref } from "./OrderPage";
import type { OrderDetail } from "./orderDetail";

const ORDER = {
  id: "o1",
  code: "MP-0142",
  status: "en_progreso",
  priority: "high",
  createdAt: "2026-10-29T09:57:00Z",
  finishedAt: null,
  deliveredAt: null,
  reportedFaults: ["broken_screen"],
  faultNotes: "Se le cayó al suelo",
  physicalCondition: "Rayas en el marco",
  accessories: "Funda",
  observations: null,
  totalPrice: "149.00",
  amountPaid: "59.00",
  balance: "90.00",
  paymentStatus: "paid_partial",
  cancelReason: null,
  workDone: null,
  warrantyOfId: null,
  client: {
    id: "c1",
    firstName: "Lucía",
    lastName: "Fernández",
    dniType: "NIF",
    dni: "12345678Z",
    email: null,
    phoneNumber: "612 345 678",
    preferredContact: "PHONE",
  },
  device: { id: "d1", type: "movil", brand: "Apple", model: "iPhone 13", imei: "356789104521337", unlockSecretType: null },
  lines: [{ id: "l1", kind: "service", description: "Cambio de pantalla", unitPrice: "149.00", quantity: 1 }],
  serviceHistory: [
    { id: "h1", action: "created", description: "Orden creada", performedAt: "2026-10-29T09:57:00Z" },
    { id: "h2", action: "updated", description: "Prioridad: Media → Alta", performedAt: "2026-10-29T10:02:00Z" },
  ],
} as unknown as OrderDetail;

const PAYMENTS = [
  { id: "p1", kind: "charge", amount: "59.00", method: "card", note: null, createdAt: "2026-10-29T09:58:00Z", createdBy: { id: "u1", fullName: "Ana Rojo" } },
];
const NOTICES = [
  { id: "n1", trigger: "received", name: "Recibido", channel: "whatsapp", body: "Hola", sentAt: "2026-10-29T10:01:00Z", sentBy: { fullName: "Ana Rojo" } },
];

vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1", role: "STORE_ADMIN" } }) }));

const fetchMock = vi.fn();
function serve(order: Partial<OrderDetail> = {}, status = 200) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/payments")) return new Response(JSON.stringify(PAYMENTS));
    if (url.endsWith("/sticky-notes")) return new Response(JSON.stringify([]));
    if (url.endsWith("/notices")) return new Response(JSON.stringify(NOTICES));
    return new Response(JSON.stringify({ ...ORDER, ...order }), { status });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  serve();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function open() {
  render(<OrderPage id="o1" />);
  await act(async () => {});
}

describe("OrderPage", () => {
  it("shows the whole order: header and actions, work, notes, history, and client, device and money aside", async () => {
    await open();
    screen.getByRole("heading", { level: 1, name: "MP-0142" });
    expect(screen.getByRole("link", { name: "Órdenes" }).getAttribute("href")).toBe("/ordenes");
    expect(screen.getByRole("link", { name: "Editar orden" }).getAttribute("href")).toBe(editHref("o1"));
    screen.getByRole("button", { name: "Finalizar…" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Servicios y trabajo",
      "Notas internas y avisos",
      "Historial",
    ]);
    const aside = within(screen.getByRole("complementary", { name: "Cliente, equipo y dinero" }));
    aside.getByText("Lucía Fernández");
    // The full page has room for the whole IMEI.
    aside.getByText("IMEI 356789104521337");
    expect(aside.getByRole("link", { name: "Ficha del cliente" }).getAttribute("href")).toBe("/clients/c1");
    expect(aside.getByText("Pendiente").nextSibling?.textContent).toMatch(/^90,00\s€$/);
    screen.getByText("Cambio de pantalla");
    screen.getByLabelText("Nueva nota interna");
  });

  it("puts states, edits, payments and notices in one history and filters it", async () => {
    await open();
    const history = () =>
      within(screen.getByRole("heading", { name: "Historial" }).parentElement!)
        .getAllByRole("listitem")
        .map((li) => li.firstChild?.textContent);
    expect(history()).toEqual([
      "Prioridad: Media → Alta",
      "Aviso «Recibido» por WhatsApp",
      expect.stringMatching(/^Cobro 59,00\s€ · Tarjeta$/),
      "Orden creada",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Cobros" }));
    expect(screen.getByRole("button", { name: "Cobros" }).getAttribute("aria-pressed")).toBe("true");
    expect(history()).toEqual([expect.stringMatching(/^Cobro 59,00/)]);
    fireEvent.click(screen.getByRole("button", { name: "Ediciones" }));
    expect(history()).toEqual(["Prioridad: Media → Alta"]);
    fireEvent.click(screen.getByRole("button", { name: "Estados" }));
    expect(history()).toEqual(["Orden creada"]);
  });

  it("«Cobrar» opens the charge form in the money block", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    const aside = within(screen.getByRole("complementary", { name: "Cliente, equipo y dinero" }));
    expect((aside.getByLabelText("Importe") as HTMLInputElement).value).toBe("90,00");
  });

  it("does not offer editing on a delivered order", async () => {
    serve({ status: "entregado" } as Partial<OrderDetail>);
    await open();
    screen.getByText("Entregada · solo lectura");
    expect(screen.queryByRole("link", { name: "Editar orden" })).toBeNull();
  });

  it("says when the order does not exist or is another store's", async () => {
    serve({}, 404);
    await open();
    screen.getByText("No existe esta orden");
    expect(screen.getByRole("link", { name: "Volver a Órdenes" }).getAttribute("href")).toBe("/ordenes");
  });
});
