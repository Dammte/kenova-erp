import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import OrderPanel, { REVEAL_MS } from "./OrderPanel";
import { shopDays, whatsappHref, type OrderDetail } from "./orderDetail";

const ORDER: OrderDetail = {
  id: "o1",
  code: "MP-0142",
  status: "en_progreso",
  priority: "high",
  createdAt: "2026-10-29T09:57:00Z",
  finishedAt: null,
  deliveredAt: null,
  reportedFaults: ["broken_screen"],
  faultNotes: null,
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
    email: "lucia@correo.es",
    phoneNumber: "612 345 678",
    preferredContact: "PHONE",
  },
  device: {
    id: "d1",
    type: "movil",
    brand: "Apple",
    model: "iPhone 13",
    imei: "356789104521337",
    unlockSecretType: "CODE",
  },
  lines: [{ id: "l1", kind: "service", description: "Cambio de pantalla", unitPrice: "149.00", quantity: 1 }],
  serviceHistory: [
    { id: "h1", action: "created", description: "Orden creada", performedAt: "2026-10-29T09:57:00Z" },
  ],
};

const PAYMENTS = [
  {
    id: "p1",
    kind: "charge",
    amount: "79.00",
    method: "card",
    note: null,
    createdAt: "2026-10-29T09:58:00Z",
    createdBy: { id: "u1", fullName: "Ana Rojo" },
  },
  {
    id: "p2",
    kind: "refund",
    amount: "20.00",
    method: "card",
    note: "Funda devuelta",
    createdAt: "2026-10-29T10:30:00Z",
    createdBy: null,
  },
];

const NOTES = [{ id: 1, content: "No restaurar sin llamar", type: "important", createdAt: "2026-10-29T09:58:00Z" }];

const fetchMock = vi.fn();
const onClose = vi.fn();

function serve(overrides: Record<string, Response> = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (overrides[url]) return overrides[url];
    if (url.endsWith("/payments")) return new Response(JSON.stringify(PAYMENTS));
    if (url.endsWith("/sticky-notes")) return new Response(JSON.stringify(NOTES));
    if (url.endsWith("/reveal")) return new Response(JSON.stringify({ type: "CODE", value: "4321" }));
    return new Response(JSON.stringify(ORDER));
  });
}

beforeEach(() => {
  onClose.mockReset();
  fetchMock.mockReset();
  serve();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function open() {
  render(<OrderPanel id="o1" code="MP-0142" fullHref="/serviceOrders/o1" onClose={onClose} />);
  await act(async () => {});
}

describe("OrderPanel", () => {
  it("leads with the fault, then the work, the money, the device and the client", async () => {
    await open();
    screen.getByRole("dialog", { name: "Orden MP-0142" });
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual([
      "Avería declarada en la entrada",
      "Servicios y piezas",
      "Pagos",
      "Dispositivo",
      "Cliente",
      "Notas internas",
      "Historial",
    ]);
    screen.getByText("Pantalla rota");
    screen.getByText("Rayas en el marco");
    screen.getByText("Alta");
    screen.getByText("Móvil · Apple iPhone 13");
    screen.getByText("Lucía Fernández");
    screen.getByText("NIF 12345678Z", { exact: false });
    screen.getByText("No restaurar sin llamar");
    screen.getByText("Orden creada");
  });

  it("lists charges and refunds and what is still owed", async () => {
    await open();
    screen.getByText("79,00 €");
    screen.getByText("-20,00 €");
    screen.getByText(/Devolución · Tarjeta · Funda devuelta/);
    expect(screen.getByText("Pendiente").nextSibling?.textContent).toMatch(/^90,00\s€$/);
  });

  it("calls and messages the client", async () => {
    await open();
    expect(screen.getByRole("link", { name: "Llamar" }).getAttribute("href")).toBe("tel:612345678");
    expect(screen.getByRole("link", { name: "WhatsApp" }).getAttribute("href")).toBe(
      "https://wa.me/34612345678",
    );
  });

  it("shows the unlock code on request and hides it after 30 s", async () => {
    vi.useFakeTimers();
    await open();
    expect(screen.queryByText("4321")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith("/api/devices/d1/unlock-secret/reveal", expect.objectContaining({ method: "POST" }));
    screen.getByText("4321");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REVEAL_MS);
    });
    expect(screen.queryByText("4321")).toBeNull();
  });

  it("says when the order does not exist or is another store's", async () => {
    serve({ "/api/service-orders/o1": new Response("{}", { status: 404 }) });
    await open();
    screen.getByText("No encontramos la orden MP-0142");
  });

  it("closes with Esc and with the close button", async () => {
    await open();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("order helpers", () => {
  it("counts days in the shop, or days uncollected once finished", () => {
    const now = Date.parse("2026-11-08T10:00:00Z");
    expect(shopDays(ORDER, now)).toBe(10);
    expect(shopDays({ ...ORDER, status: "finalizado", finishedAt: "2026-11-05T10:00:00Z" }, now)).toBe(3);
    expect(shopDays({ ...ORDER, status: "entregado" }, now)).toBeNull();
  });

  it("adds Spain's prefix to a national number for WhatsApp", () => {
    expect(whatsappHref("+44 7700 900123")).toBe("https://wa.me/447700900123");
  });
});
