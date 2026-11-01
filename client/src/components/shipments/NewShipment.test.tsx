import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NewShipment } from "./NewShipment";
import { FAULT_LABEL } from "@/components/orders/orderList";
import { faultText, ShipmentSheet } from "./ShipmentSheet";
import type { Shipment, ShipmentCandidate } from "./shipments";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const C = (n: number, client: string, device: string): ShipmentCandidate => ({
  orderId: `o${n}`,
  orderCode: `VC-00${n}`,
  status: "en_progreso",
  clientName: client,
  device,
  accessories: n === 36 ? "funda" : null,
});
const CANDIDATES = [
  C(36, "Iker Bárcena", "Apple iPhone 13"),
  C(37, "Sonia Gil", "Xiaomi Redmi Note 12"),
];
const STORES = [
  { id: "s1", name: "Medina de Pomar", isMain: true, isActive: true },
  { id: "s2", name: "Villarcayo", isMain: false, isActive: true },
  { id: "s3", name: "Espinosa", isMain: false, isActive: true },
  { id: "s4", name: "Cerrada", isMain: false, isActive: false },
];

const onCreated = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  onCreated.mockReset();
  onCancel.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/stores") return json(STORES);
    if (url.startsWith("/api/shipments/candidates")) return json(CANDIDATES);
    if (url === "/api/shipments" && init?.method === "POST")
      return json({ id: "e15" }, 201);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const calls = () => fetchMock.mock.calls.map((c) => c[0] as string);
const create = () => screen.getByRole("button", { name: "Crear envío" });

async function show(partner: boolean) {
  render(
    <NewShipment partner={partner} onCreated={onCreated} onCancel={onCancel} />,
  );
  await act(async () => {});
}

describe("NewShipment", () => {
  it("a store ticks its devices and ships them to Medina", async () => {
    await show(false);
    expect(calls()).toEqual(["/api/shipments/candidates"]);
    screen.getByRole("heading", { name: "Nuevo envío a Medina" });
    expect((create() as HTMLButtonElement).disabled).toBe(true);
    screen.getByText("Añade al menos un equipo");

    fireEvent.click(screen.getByRole("checkbox", { name: /VC-0036/ }));
    screen.getByText("1 de 2 equipos marcados");
    fireEvent.change(screen.getByLabelText("Transportista (opcional)"), {
      target: { value: " Transportes Merindades " },
    });
    fireEvent.click(create());
    await act(async () => {});
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("/api/shipments");
    expect(JSON.parse(init.body as string)).toEqual({
      orderIds: ["o36"],
      carrier: "Transportes Merindades",
    });
    expect(onCreated).toHaveBeenCalledWith("e15");
  });

  it("«Marcar todos» ticks and unticks every device", async () => {
    await show(false);
    const all = screen.getByRole("checkbox", { name: "Marcar todos" });
    fireEvent.click(all);
    screen.getByText("2 de 2 equipos marcados");
    fireEvent.click(all);
    screen.getByText("0 de 2 equipos marcados");
  });

  it("the partners choose an active partner store and see its devices at Medina", async () => {
    await show(true);
    screen.getByRole("heading", { name: "Envío a tienda" });
    const select = screen.getByLabelText("Tienda a la que vuelve");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Elige la tienda…", "Villarcayo", "Espinosa"]);
    expect(calls().some((u) => u.includes("candidates"))).toBe(false);

    fireEvent.change(select, { target: { value: "s2" } });
    await act(async () => {});
    expect(calls()).toContain("/api/shipments/candidates?toStoreId=s2");
    fireEvent.click(screen.getByRole("checkbox", { name: /VC-0037/ }));
    fireEvent.click(create());
    await act(async () => {});
    const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      orderIds: ["o37"],
      toStoreId: "s2",
    });
  });

  it("says why when there is nothing to send, or the server refuses", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("/api/shipments/candidates") ? json([]) : json({}, 404),
    );
    await show(false);
    screen.getByText(
      "No hay equipos en la tienda pendientes de enviar a Medina.",
    );
    cleanup();

    fetchMock.mockImplementation(async () =>
      json({ message: "Los envíos desde Medina los crea un socio" }, 400),
    );
    await show(false);
    screen.getByText("Los envíos desde Medina los crea un socio");
  });

  it("keeps the ticked devices when the shipment is refused", async () => {
    await show(false);
    fireEvent.click(screen.getByRole("checkbox", { name: /VC-0036/ }));
    fetchMock.mockResolvedValueOnce(
      json({ message: "No se pueden enviar: VC-0036 (Enviado a Medina)" }, 400),
    );
    fireEvent.click(create());
    await act(async () => {});
    screen.getByText("No se pueden enviar: VC-0036 (Enviado a Medina)");
    expect(
      (screen.getByRole("checkbox", { name: /VC-0036/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("ShipmentSheet", () => {
  const SHIPMENT: Shipment = {
    id: "e14",
    code: "ENV-0014",
    status: "sent",
    fromStore: { id: "s2", name: "Villarcayo" },
    toStore: { id: "s1", name: "Medina de Pomar" },
    carrier: "Transportes Merindades",
    createdBy: null,
    createdAt: "2026-10-30T09:00:00Z",
    receivedAt: null,
    deviceCount: 1,
    lines: [
      {
        orderId: "o36",
        orderCode: "VC-0036",
        clientName: "Iker Bárcena",
        device: "Apple iPhone 13",
        accessories: "funda",
        reportedFaults: ["broken_screen", "battery"],
        faultNotes: "El táctil falla abajo",
        receivedAt: null,
        notArrived: false,
      },
    ],
  };

  it("names the fault from its marks and notes, or nothing if none was noted", () => {
    const line = SHIPMENT.lines![0];
    expect(
      faultText({ ...line, reportedFaults: [], faultNotes: " " }),
    ).toBeNull();
    expect(
      faultText({ ...line, reportedFaults: [], faultNotes: "Cámara" }),
    ).toBe("Cámara");
    expect(
      faultText({ ...line, reportedFaults: ["other"], faultNotes: null }),
    ).toBe(FAULT_LABEL.other);
  });

  it("prints the devices with a box to tick and the three signatures", async () => {
    fetchMock.mockImplementation(async () => json(SHIPMENT));
    render(<ShipmentSheet id="e14" />);
    await act(async () => {});
    expect(calls()).toEqual(["/api/shipments/e14"]);
    const sheet = screen.getByRole("article", {
      name: "Hoja de envío ENV-0014",
    });
    within(sheet).getByText("Villarcayo → Medina de Pomar · 30/10/2026");
    const row = within(sheet).getAllByRole("row")[1];
    within(row).getByText("VC-0036");
    within(row).getByText("funda");
    expect(within(row).getByText(/El táctil/).textContent).toBe(
      `${FAULT_LABEL.broken_screen}, ${FAULT_LABEL.battery} · El táctil falla abajo`,
    );
    within(sheet).getByText(
      "1 equipo. Cada equipo va en su bolsa con la etiqueta de 62 mm.",
    );
    within(sheet).getByText("Entrega · Villarcayo");
    within(sheet).getByText("Recibe · Medina de Pomar");
    within(sheet).getByText("Documento interno · no válido como factura");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Imprimir" }),
    );
  });
});
