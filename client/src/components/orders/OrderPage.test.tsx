import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import OrderPage from "./OrderPage";
import type { OrderDetail } from "./orderDetail";

const ORDER = {
  id: "o1",
  code: "MP-0142",
  status: "en_progreso",
  priority: "high",
  createdAt: "2026-10-29T09:57:00Z",
  updatedAt: "2026-10-29T10:02:00.123Z",
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

const RATES = [
  { id: "s-bat", name: "Batería iPhone 13", price: "45.00", quality: null, model: null },
  { id: "s-pan", name: "Cambio de pantalla", price: "149.00", quality: null, model: null },
];

vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1", role: "STORE_ADMIN" } }) }));

const fetchMock = vi.fn();
let writes: Record<string, Response> = {};
function serve(order: Partial<OrderDetail> = {}, status = 200) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") return writes[`${init.method} ${url}`] ?? new Response("{}");
    if (url.endsWith("/payments")) return new Response(JSON.stringify(PAYMENTS));
    if (url.endsWith("/sticky-notes")) return new Response(JSON.stringify([]));
    if (url.endsWith("/notices")) return new Response(JSON.stringify(NOTICES));
    if (url.includes("/services/rates")) return new Response(JSON.stringify(RATES));
    return new Response(JSON.stringify({ ...ORDER, ...order }), { status });
  });
}

beforeEach(() => {
  writes = {};
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
    // Everything is edited here now: no link to the previous edit screen.
    expect(screen.queryByRole("link", { name: /pantalla anterior/ })).toBeNull();
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
    expect(screen.queryByRole("link", { name: "Más cambios en la pantalla anterior" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Editar / })).toBeNull();
  });

  it("says when the order does not exist or is another store's", async () => {
    serve({}, 404);
    await open();
    screen.getByText("No existe esta orden");
    expect(screen.getByRole("link", { name: "Volver a Órdenes" }).getAttribute("href")).toBe("/ordenes");
  });

  describe("editing block by block", () => {
    const sent = (method: string) =>
      fetchMock.mock.calls
        .filter(([, init]) => (init as RequestInit | undefined)?.method === method)
        .map(([url, init]) => [url, JSON.parse(String((init as RequestInit).body))]);

    it("saves the fault with the version it was loaded at", async () => {
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Editar la avería" }));
      const form = within(screen.getByRole("form", { name: "Editar avería" }));
      fireEvent.click(form.getByLabelText("Batería"));
      fireEvent.change(form.getByLabelText("Accesorios que deja"), { target: { value: "  " } });
      fireEvent.click(form.getByLabelText("Urgente"));
      fireEvent.click(form.getByRole("button", { name: "Guardar" }));
      await act(async () => {});
      expect(sent("PATCH")).toEqual([
        [
          "/api/service-orders/o1",
          // Only what was changed, so nothing else is overwritten.
          {
            reportedFaults: ["broken_screen", "battery"],
            accessories: null,
            priority: "urgent",
            expectedUpdatedAt: "2026-10-29T10:02:00.123Z",
          },
        ],
      ]);
      expect(screen.queryByRole("form", { name: "Editar avería" })).toBeNull();
    });

    it("when someone changed the order meanwhile, keeps what was typed and saves after reloading", async () => {
      writes["PATCH /api/service-orders/o1"] = new Response(
        JSON.stringify({ message: "Otra persona ha cambiado esta orden mientras la editabas.", code: "ORDER_CHANGED" }),
        { status: 409 },
      );
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Editar la avería" }));
      const notes = () => screen.getByLabelText("Lo que cuenta el cliente") as HTMLInputElement;
      fireEvent.change(notes(), { target: { value: "Pantalla negra" } });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await act(async () => {});
      screen.getByText("Otra persona ha cambiado esta orden mientras la editabas.");
      expect(screen.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(true);

      // The reload brings the other change (urgent, Cargador) and its new version.
      serve({ updatedAt: "2026-10-29T11:00:00.000Z", priority: "urgent", accessories: "Cargador" } as Partial<OrderDetail>);
      writes = {};
      fireEvent.click(screen.getByRole("button", { name: "Recargar y conservar lo mío" }));
      await act(async () => {});
      expect(notes().value).toBe("Pantalla negra");
      // What was not touched shows the other person's change, and is not sent back.
      expect((screen.getByLabelText("Accesorios que deja") as HTMLInputElement).value).toBe("Cargador");
      expect((screen.getByLabelText("Urgente") as HTMLInputElement).checked).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await act(async () => {});
      expect(sent("PATCH").at(-1)?.[1]).toEqual({ faultNotes: "Pantalla negra", expectedUpdatedAt: "2026-10-29T11:00:00.000Z" });
    });

    it("edits the client's contact data", async () => {
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Editar el cliente" }));
      fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "699 000 111" } });
      fireEvent.click(screen.getByLabelText("SMS"));
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await act(async () => {});
      expect(sent("PATCH")).toEqual([
        [
          "/api/clients/c1",
          { firstName: "Lucía", lastName: "Fernández", phoneNumber: "699 000 111", email: null, preferredContact: "SMS" },
        ],
      ]);
    });

    it("edits the services: a rate, a line by hand, quantity and price, and the total is their sum", async () => {
      serve({
        lines: [
          { id: "l1", kind: "service", description: "Cambio de pantalla", unitPrice: "149.00", quantity: 1, serviceId: "s-pan" },
          { id: "l2", kind: "adjustment", description: "Ajuste", unitPrice: "-10.00", quantity: 1, serviceId: null },
        ],
        totalPrice: "139.00",
      } as Partial<OrderDetail>);
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Editar los servicios" }));
      const form = within(screen.getByRole("form", { name: "Editar servicios y piezas" }));
      // The adjustment is not a line to edit: the total becomes the sum.
      form.getByText(/tenía un ajuste de -10,00/);
      expect(form.queryByDisplayValue("Ajuste")).toBeNull();

      fireEvent.change(form.getByLabelText("Añadir tarifa"), { target: { value: "bat" } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
      fireEvent.click(form.getByRole("button", { name: /Batería iPhone 13/ }));
      fireEvent.change(form.getByLabelText("Cantidad 2"), { target: { value: "2" } });
      fireEvent.change(form.getByLabelText("Precio 1"), { target: { value: "139,5" } });
      fireEvent.click(form.getByRole("button", { name: "Línea libre" }));
      fireEvent.change(form.getByLabelText("Concepto 3"), { target: { value: "Funda" } });
      fireEvent.change(form.getByLabelText("Precio 3"), { target: { value: "9" } });
      expect(form.getByLabelText("Total de la orden").textContent).toMatch(/^238,50\s€$/);

      fireEvent.click(form.getByRole("button", { name: "Guardar" }));
      await act(async () => {});
      expect(sent("PATCH")).toEqual([
        [
          "/api/service-orders/o1",
          {
            editedLines: [
              { serviceId: "s-pan", description: "Cambio de pantalla", unitPrice: 139.5, quantity: 1 },
              { serviceId: "s-bat", description: "Batería iPhone 13", unitPrice: 45, quantity: 2 },
              { description: "Funda", unitPrice: 9, quantity: 1 },
            ],
            expectedUpdatedAt: "2026-10-29T10:02:00.123Z",
          },
        ],
      ]);
    });

    it("picking a rate already on the order adds one more instead of a second line", async () => {
      serve({
        lines: [{ id: "l1", kind: "service", description: "Cambio de pantalla", unitPrice: "149.00", quantity: 1, serviceId: "s-pan" }],
      } as Partial<OrderDetail>);
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Editar los servicios" }));
      const form = within(screen.getByRole("form", { name: "Editar servicios y piezas" }));
      fireEvent.change(form.getByLabelText("Añadir tarifa"), { target: { value: "pan" } });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 300));
      });
      fireEvent.click(within(form.getByRole("list", { name: "Tarifas encontradas" })).getByRole("button", { name: /Cambio de pantalla/ }));
      expect(form.getAllByLabelText(/^Concepto/)).toHaveLength(1);
      expect((form.getByLabelText("Cantidad 1") as HTMLInputElement).value).toBe("2");
    });

    it("will not save a total below what was charged, nor a line without its price", async () => {
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Editar los servicios" }));
      const form = within(screen.getByRole("form", { name: "Editar servicios y piezas" }));
      fireEvent.click(form.getByRole("button", { name: "Quitar Cambio de pantalla" }));
      form.getByText(/Sin líneas/);
      form.getByText("Ya se han cobrado 59,00 €; el total no puede ser menor. Devuelve primero la diferencia.");
      expect(form.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(true);

      fireEvent.click(form.getByRole("button", { name: "Línea libre" }));
      fireEvent.change(form.getByLabelText("Concepto 1"), { target: { value: "Revisión" } });
      form.getByText("Cada línea necesita concepto e importe.");
      fireEvent.change(form.getByLabelText("Precio 1"), { target: { value: "60" } });
      expect(form.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(false);
    });

    it("edits the device: only what changed, and a new unlock secret replaces the old one", async () => {
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Editar el equipo" }));
      const form = within(screen.getByRole("form", { name: "Editar equipo" }));
      fireEvent.change(form.getByLabelText("Modelo"), { target: { value: "iPhone 13 Pro" } });
      fireEvent.change(form.getByLabelText("IMEI / nº de serie"), { target: { value: "35 6789-104521 399" } });
      fireEvent.click(form.getByLabelText("PIN o contraseña"));
      expect(form.getByRole("button", { name: "Guardar" }).hasAttribute("disabled")).toBe(true);
      fireEvent.change(form.getByLabelText("PIN o contraseña nuevo"), { target: { value: "2468" } });
      fireEvent.click(form.getByRole("button", { name: "Guardar" }));
      await act(async () => {});
      expect(sent("PATCH")).toEqual([
        ["/api/service-orders/o1", { editedDevice: { model: "iPhone 13 Pro", imei: "356789104521399", code: "2468" } }],
      ]);
    });

    it("removes the stored unlock secret only when «Sin código» is chosen", async () => {
      serve({ device: { ...ORDER.device!, unlockSecretType: "PATTERN" } } as Partial<OrderDetail>);
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Editar el equipo" }));
      const form = within(screen.getByRole("form", { name: "Editar equipo" }));
      expect((form.getByLabelText("Mantener el patrón") as HTMLInputElement).checked).toBe(true);
      fireEvent.click(form.getByLabelText("Sin código"));
      form.getByText("Al guardar se borra el patrón guardado.");
      fireEvent.click(form.getByRole("button", { name: "Guardar" }));
      await act(async () => {});
      expect(sent("PATCH")).toEqual([["/api/service-orders/o1", { editedDevice: { clearSecret: true } }]]);
    });

    it("edits one block at a time: changes in one have to be saved or discarded first", async () => {
      await open();
      fireEvent.click(screen.getByRole("button", { name: "Editar la avería" }));
      fireEvent.change(screen.getByLabelText("Estado físico"), { target: { value: "Golpe" } });
      fireEvent.click(screen.getByRole("button", { name: "Editar el cliente" }));
      screen.getByText("Guarda o descarta los cambios de la avería antes de editar el cliente.");
      expect(screen.queryByRole("form", { name: "Editar cliente" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      fireEvent.click(screen.getByRole("button", { name: "Editar el cliente" }));
      screen.getByRole("form", { name: "Editar cliente" });
    });
  });
});
