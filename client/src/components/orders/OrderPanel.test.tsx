import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import OrderPanel, { REVEAL_MS } from "./OrderPanel";
import { shopDays, whatsappHref, type OrderDetail, type OrderNote } from "./orderDetail";
import { sortNotes } from "./OrderNotes";

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

const NOTES = [
  {
    id: 1,
    content: "No restaurar sin llamar",
    type: "important",
    createdAt: "2026-10-29T09:58:00Z",
    createdBy: { id: "u1", fullName: "Ana Rojo" },
  },
];

let role: "SUPER_ADMIN" | "STORE_ADMIN" = "STORE_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", role } }),
}));

const INVENTORY = [
  { id: "i1", sku: "SCR-IP13", name: "Pantalla iPhone 13", stock: 3 },
  { id: "i2", sku: "BAT-A54", name: "Batería Galaxy A54", stock: 0 },
];

const fetchMock = vi.fn();
const onClose = vi.fn();
const onChanged = vi.fn();

function serve(overrides: Record<string, Response> = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (overrides[url]) return overrides[url];
    if (url.endsWith("/payments")) return new Response(JSON.stringify(PAYMENTS));
    if (url.endsWith("/sticky-notes")) return new Response(JSON.stringify(NOTES));
    if (url.endsWith("/reveal")) return new Response(JSON.stringify({ type: "CODE", value: "4321" }));
    if (url.endsWith("/inventory")) return new Response(JSON.stringify(INVENTORY));
    return new Response(JSON.stringify(ORDER));
  });
}

beforeEach(() => {
  onClose.mockReset();
  onChanged.mockReset();
  role = "STORE_ADMIN";
  fetchMock.mockReset();
  serve();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function open(order?: Partial<OrderDetail>) {
  if (order) serve({ "/api/service-orders/o1": new Response(JSON.stringify({ ...ORDER, ...order })) });
  render(
    <OrderPanel id="o1" code="MP-0142" fullHref="/serviceOrders/o1" onClose={onClose} onChanged={onChanged} />,
  );
  await act(async () => {});
}

const patches = () =>
  fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([url, init]) => [url, JSON.parse((init as RequestInit).body as string)]);

describe("OrderPanel", () => {
  it("leads with the fault, then the work, the money, the device and the client", async () => {
    await open();
    screen.getByRole("dialog", { name: "Orden MP-0142" });
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual([
      "Siguiente paso",
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

  it("adds an internal note on the spot, with its author", async () => {
    await open();
    screen.getByText(/Ana Rojo · 29\/10\/2026 \d\d:58 · importante/);
    const field = screen.getByLabelText("Nueva nota interna");
    expect(screen.getByRole("button", { name: "Añadir" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(field, { target: { value: "  Pieza pedida a MobileParts  " } });
    serve({
      "/api/service-orders/o1/sticky-notes": new Response(
        JSON.stringify({
          id: 2,
          content: "Pieza pedida a MobileParts",
          type: "normal",
          createdAt: "2026-10-30T10:00:00Z",
          createdBy: { id: "u2", fullName: "Diego Sanz" },
        }),
        { status: 201 },
      ),
    });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    await act(async () => {});
    const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ content: "Pieza pedida a MobileParts", type: "normal" }));
    screen.getByText("Pieza pedida a MobileParts");
    screen.getByText(/Diego Sanz/);
    expect((field as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps the note typed when it cannot be saved", async () => {
    await open();
    const field = screen.getByLabelText("Nueva nota interna");
    fireEvent.change(field, { target: { value: "Llamar mañana" } });
    serve({
      "/api/service-orders/o1/sticky-notes": new Response(JSON.stringify({ message: "boom" }), {
        status: 500,
      }),
    });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    await act(async () => {});
    screen.getByRole("alert");
    expect((field as HTMLTextAreaElement).value).toBe("Llamar mañana");
  });

  it("closes with Esc and with the close button", async () => {
    await open();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("OrderPanel next step", () => {
  it("finishes the order with the work done, the tests and the result", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Finalizar…" }));
    const finish = screen.getByRole("button", { name: "Finalizar orden" });
    expect(finish.hasAttribute("disabled")).toBe(true);
    screen.getByText("Escribe el trabajo realizado.");

    fireEvent.change(screen.getByLabelText(/Trabajo realizado/), { target: { value: " Pantalla cambiada " } });
    fireEvent.click(screen.getByLabelText("Carga"));
    fireEvent.click(screen.getByLabelText("Táctil"));
    fireEvent.click(screen.getByLabelText("No reparado"));
    screen.getByText("Indica por qué no se repara.");
    fireEvent.change(screen.getByLabelText("Por qué no se repara"), { target: { value: "Placa dañada" } });
    const reads = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Finalizar orden" }));
    await act(async () => {});

    expect(patches()).toEqual([
      [
        "/api/service-orders/o1",
        {
          status: "finalizado",
          workDone: "Pantalla cambiada",
          testsDone: ["touch", "charging"],
          result: "not_repaired",
          notRepairedReason: "Placa dañada",
        },
      ],
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    // The panel reloads the order after the change.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(reads + 1);
  });

  it("sends a repaired order without a reason", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Finalizar…" }));
    fireEvent.change(screen.getByLabelText(/Trabajo realizado/), { target: { value: "Batería nueva" } });
    fireEvent.click(screen.getByRole("button", { name: "Finalizar orden" }));
    await act(async () => {});
    expect(patches()[0][1]).toEqual({
      status: "finalizado",
      workDone: "Batería nueva",
      testsDone: [],
      result: "repaired",
      notRepairedReason: null,
    });
  });

  it.each([
    ["pendiente_piezas", "Pieza recibida"],
    ["pendiente_cliente", "Cliente respondió"],
  ] as const)("takes a %s order back to work", async (status, label) => {
    await open({ status });
    fireEvent.click(screen.getByRole("button", { name: label }));
    await act(async () => {});
    expect(patches()).toEqual([["/api/service-orders/o1", { status: "en_progreso" }]]);
    expect(onChanged).toHaveBeenCalled();
  });

  const FINISHED = { status: "finalizado", finishedAt: "2026-10-30T10:00:00Z", workDone: "Pantalla OLED nueva" } as const;
  const posts = () =>
    fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
      .map(([url, init]) => [url, JSON.parse((init as RequestInit).body as string)]);
  const deliverButton = (name: RegExp) => screen.getByRole("button", { name });

  it("charges what is owed and delivers in one step", async () => {
    await open(FINISHED);
    fireEvent.click(screen.getByRole("button", { name: "Entregar…" }));
    expect(screen.getAllByText("Pantalla OLED nueva")).toHaveLength(2);
    screen.getByText(/devolver: Funda · estado de entrada: Rayas en el marco/);
    expect(deliverButton(/^Cobrar 90,00\s€ y entregar$/).hasAttribute("disabled")).toBe(true);
    screen.getByText("Falta: elige la forma de pago, marca «Cliente conforme».");
    fireEvent.click(screen.getByLabelText("Efectivo"));
    fireEvent.click(screen.getByLabelText("Cliente conforme · ha revisado el equipo"));
    fireEvent.click(deliverButton(/^Cobrar 90,00\s€ y entregar$/));
    await act(async () => {});
    expect(posts()).toEqual([
      [
        "/api/service-orders/o1/payments",
        { id: expect.stringMatching(/^[0-9a-f-]{36}$/), kind: "charge", amount: 90, method: "cash" },
      ],
    ]);
    expect(patches()).toEqual([["/api/service-orders/o1", { status: "entregado" }]]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("hands over with money owed only with a reason", async () => {
    await open(FINISHED);
    fireEvent.click(screen.getByRole("button", { name: "Entregar…" }));
    fireEvent.click(screen.getByLabelText("Entregar con saldo pendiente"));
    fireEvent.click(screen.getByLabelText("Cliente conforme · ha revisado el equipo"));
    expect(deliverButton(/^Entregar con saldo pendiente$/).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Motivo/), { target: { value: " Pagará mañana " } });
    fireEvent.click(deliverButton(/^Entregar con saldo pendiente$/));
    await act(async () => {});
    expect(posts()).toEqual([]);
    expect(patches()).toEqual([["/api/service-orders/o1", { status: "entregado", owedReason: "Pagará mañana" }]]);
  });

  it("delivers a paid order once the client agrees", async () => {
    await open({ ...FINISHED, balance: "0.00", amountPaid: "149.00" });
    fireEvent.click(screen.getByRole("button", { name: "Entregar…" }));
    screen.getByText("Pagado del todo.");
    fireEvent.click(screen.getByLabelText("Cliente conforme · ha revisado el equipo"));
    fireEvent.click(deliverButton(/^Entregar$/));
    await act(async () => {});
    expect(patches()).toEqual([["/api/service-orders/o1", { status: "entregado" }]]);
  });

  it("does not charge twice when the delivery is retried", async () => {
    await open(FINISHED);
    fireEvent.click(screen.getByRole("button", { name: "Entregar…" }));
    fireEvent.click(screen.getByLabelText("Tarjeta"));
    fireEvent.click(screen.getByLabelText("Cliente conforme · ha revisado el equipo"));
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("Failed to fetch");
    });
    fireEvent.click(deliverButton(/y entregar$/));
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toContain("No cobres otra vez");
    fireEvent.click(deliverButton(/y entregar$/));
    await act(async () => {});
    const [first, second] = posts().map(([, body]) => body.id);
    expect(second).toBe(first);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("shows why the server refused the change", async () => {
    await open({ status: "pendiente_piezas" });
    fetchMock.mockImplementationOnce(
      async () => new Response(JSON.stringify({ message: "El equipo aún no ha vuelto a la tienda" }), { status: 400 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pieza recibida" }));
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toContain("El equipo aún no ha vuelto a la tienda");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("offers nothing on a delivered or cancelled order", async () => {
    await open({ status: "entregado" });
    expect(screen.queryByText("Siguiente paso")).toBeNull();
  });
});

describe("OrderPanel charge", () => {
  const posts = () =>
    fetchMock.mock.calls
      .filter(([url, init]) => String(url).endsWith("/payments") && (init as RequestInit | undefined)?.method === "POST")
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));

  it("charges what is pending with the chosen method", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    expect((screen.getByLabelText("Importe") as HTMLInputElement).value).toBe("90,00");
    expect(screen.getByRole("button", { name: /^Cobrar 90,00\s€$/ }).hasAttribute("disabled")).toBe(true);
    screen.getByText("Elige la forma de pago.");
    fireEvent.click(screen.getByLabelText("Tarjeta"));
    fireEvent.click(screen.getByRole("button", { name: /^Cobrar 90,00\s€$/ }));
    await act(async () => {});
    const [body] = posts();
    expect(body).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), kind: "charge", amount: 90, method: "card", note: null });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("form", { name: "Registrar cobro" })).toBeNull();
  });

  it("offers half the pending amount and works out the change in cash", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    fireEvent.click(screen.getByRole("button", { name: /^50 % · 45,00\s€$/ }));
    expect((screen.getByLabelText("Importe") as HTMLInputElement).value).toBe("45,00");
    fireEvent.click(screen.getByLabelText("Efectivo"));
    fireEvent.change(screen.getByLabelText("Entrega el cliente · opcional"), { target: { value: "50" } });
    screen.getByText(/^Cambio: 5,00\s€$/);
  });

  it("retries a lost charge with the same id, so it is never recorded twice", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    fireEvent.click(screen.getByLabelText("Efectivo"));
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("Failed to fetch");
    });
    fireEvent.click(screen.getByRole("button", { name: /^Cobrar 90,00\s€$/ }));
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toContain("No cobres otra vez en el datáfono");
    fireEvent.click(screen.getByRole("button", { name: /^Cobrar 90,00\s€$/ }));
    await act(async () => {});
    const [first, second] = posts();
    expect(second.id).toBe(first.id);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("closes the form with Esc and leaves the panel open", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    fireEvent.keyDown(screen.getByLabelText("Importe"), { key: "Escape" });
    expect(screen.queryByLabelText("Importe")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says when the order is already paid", async () => {
    await open({ balance: "0.00", amountPaid: "149.00", paymentStatus: "paid" });
    expect(screen.getByRole("button", { name: "Registrar cobro" }).hasAttribute("disabled")).toBe(true);
    screen.getByText("Esta orden ya está pagada.");
  });
});

describe("OrderPanel parts used", () => {
  const startFinish = async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Finalizar…" }));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText(/Trabajo realizado/), { target: { value: "Pantalla cambiada" } });
  };

  it("a store finishes without seeing stock", async () => {
    await startFinish();
    expect(screen.queryByText(/Piezas usadas/)).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/inventory"))).toBe(false);
  });

  it("a partner adds the parts used and they leave stock with the finish", async () => {
    role = "SUPER_ADMIN";
    await startFinish();
    fireEvent.change(screen.getByLabelText("Buscar pieza del inventario"), { target: { value: "pantalla ip" } });
    fireEvent.click(screen.getByRole("button", { name: /Pantalla iPhone 13 · SCR-IP13 · stock 3/ }));
    fireEvent.change(screen.getByLabelText("Cantidad de Pantalla iPhone 13"), { target: { value: "2" } });
    screen.getByText(/stock 3 → 1/);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar orden" }));
    await act(async () => {});
    expect(patches()[0][1]).toMatchObject({ status: "finalizado", parts: [{ inventoryId: "i1", quantity: 2 }] });
  });

  it("will not finish with a part out of stock", async () => {
    role = "SUPER_ADMIN";
    await startFinish();
    fireEvent.change(screen.getByLabelText("Buscar pieza del inventario"), { target: { value: "BAT" } });
    fireEvent.click(screen.getByRole("button", { name: /Batería Galaxy A54/ }));
    screen.getByText(/Sin stock: quedan 0/);
    expect(screen.getByRole("button", { name: "Finalizar orden" }).hasAttribute("disabled")).toBe(true);
    screen.getByText("Corrige las piezas sin stock.");
    fireEvent.click(screen.getByRole("button", { name: "Quitar Batería Galaxy A54" }));
    expect(screen.getByRole("button", { name: "Finalizar orden" }).hasAttribute("disabled")).toBe(false);
  });
});

describe("order helpers", () => {
  it("counts days in the shop, or days uncollected once finished", () => {
    const now = Date.parse("2026-11-08T10:00:00Z");
    expect(shopDays(ORDER, now)).toBe(10);
    expect(shopDays({ ...ORDER, status: "finalizado", finishedAt: "2026-11-05T10:00:00Z" }, now)).toBe(3);
    expect(shopDays({ ...ORDER, status: "entregado" }, now)).toBeNull();
  });

  it("puts important notes first, then the newest", () => {
    const note = (id: number, type: OrderNote["type"], day: number): OrderNote => ({
      id,
      content: "",
      type,
      createdAt: `2026-10-${day}T10:00:00Z`,
      createdBy: null,
    });
    expect(sortNotes([note(1, "normal", 20), note(2, "important", 10), note(3, "normal", 25)]).map((n) => n.id)).toEqual([2, 3, 1]);
  });

  it("adds Spain's prefix to a national number for WhatsApp", () => {
    expect(whatsappHref("+44 7700 900123")).toBe("https://wa.me/447700900123");
  });
});
