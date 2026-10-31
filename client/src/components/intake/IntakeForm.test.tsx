import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IntakeForm } from "./IntakeForm";
import { SEARCH_DELAY_MS } from "./ClientPicker";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const LUCIA = { id: "c1", firstName: "Lucía", lastName: "Fernández", phoneNumber: "612345678", dniType: null, dni: null };
const SERVICES = [
  { id: "s1", name: "Diagnóstico", price: "20.00" },
  { id: "s2", name: "Cambio de pantalla iPhone 13", price: "149.00" },
  { id: "s3", name: "Cambio de pantalla Galaxy A54", price: "119.00" },
];
const IPHONE = { id: "d1", type: "movil", brand: "Apple", model: "iPhone 13", imei: "356789104521337", createdAt: "2026-10-01T10:00:00Z" };

beforeEach(() => {
  vi.useFakeTimers();
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const create = () => screen.getByRole("button", { name: "Crear orden" });
const posted = () => {
  const call = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
  return call && { url: call[0] as string, body: JSON.parse((call[1] as RequestInit).body as string) };
};

async function search(text: string) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS);
  });
}

describe("IntakeForm", () => {
  it("says what is missing and blocks creating until it is there", () => {
    render(<IntakeForm />);
    expect(screen.getByRole("button", { name: "Cliente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avería declarada" })).toBeTruthy();
    expect((create() as HTMLButtonElement).disabled).toBe(true);
  });

  it("creates an order for a returning client's device in a few taps", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/clients/search")) return json([LUCIA]);
      if (url.includes("/devices/client/c1")) return json([IPHONE]);
      if (url.includes("/services")) return json(SERVICES);
      if (init?.method === "POST") return json({ id: "o9" }, 201);
      return json({});
    });
    render(<IntakeForm />);
    await search("lucía");
    fireEvent.click(screen.getByRole("button", { name: /Lucía Fernández/ }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Apple iPhone 13/ }));
    fireEvent.click(screen.getByLabelText("Batería"));
    fireEvent.click(screen.getByRole("button", { name: "Funda" }));

    expect(screen.getByText("Todo listo para crear la orden.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(create());
    });
    expect(posted()).toEqual({
      url: "/api/service-orders/intake",
      body: {
        clientId: "c1",
        deviceId: "d1",
        order: {
          status: "en_progreso",
          priority: "medium",
          reportedFaults: ["battery"],
          faultNotes: null,
          physicalCondition: null,
          accessories: "Funda",
        },
      },
    });
    expect(push).toHaveBeenCalledWith("/ordenes?orden=o9");
  });

  it("starts a new client from the search and opens the device form", async () => {
    fetchMock.mockImplementation(async () => json([]));
    render(<IntakeForm />);
    await search("Ana 612 345 678");
    expect(screen.getByText("Ningún cliente coincide con «Ana 612 345 678».")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });

    expect((screen.getByLabelText(/^Nombre/) as HTMLInputElement).value).toBe("Ana");
    expect((screen.getByLabelText(/^Teléfono/) as HTMLInputElement).value).toBe("612 345 678");
    expect(screen.getByLabelText(/^Marca/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dispositivo: marca" })).toBeTruthy();
  });

  it("keeps the data and offers a retry when the server refuses", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/clients/search")) return json([LUCIA]);
      if (url.includes("/devices/client/c1")) return json([IPHONE]);
      if (url.includes("/services")) return json(SERVICES);
      if (init?.method === "POST") return json({ message: "Dispositivo no encontrado" }, 404);
      return json({});
    });
    render(<IntakeForm />);
    await search("lucía");
    fireEvent.click(screen.getByRole("button", { name: /Lucía Fernández/ }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Apple iPhone 13/ }));
    fireEvent.click(screen.getByLabelText("Pantalla rota"));
    await act(async () => {
      fireEvent.click(create());
    });
    expect(screen.getByRole("alert").textContent).toContain("Dispositivo no encontrado");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Pantalla rota") as HTMLInputElement).checked).toBe(true);
  });

  it("adds the model's service first, takes a deposit and sends the money", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/clients/search")) return json([LUCIA]);
      if (url.includes("/devices/client/c1")) return json([IPHONE]);
      if (url.includes("/services")) return json(SERVICES);
      if (init?.method === "POST") return json({ id: "o9" }, 201);
      return json({});
    });
    render(<IntakeForm />);
    await search("lucía");
    fireEvent.click(screen.getByRole("button", { name: /Lucía Fernández/ }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Apple iPhone 13/ }));
    fireEvent.click(screen.getByLabelText("Pantalla rota"));

    const service = screen.getByLabelText(/Añadir servicio o tarifa/);
    fireEvent.change(service, { target: { value: "pantalla" } });
    fireEvent.keyDown(service, { key: "Enter" });
    expect(screen.getByText("Cambio de pantalla iPhone 13")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^A cuenta/), { target: { value: "200" } });
    expect(screen.getByText(/A cuenta no puede superar el total/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "A cuenta mayor que el total" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^A cuenta/), { target: { value: "59" } });
    expect(screen.getByRole("button", { name: "Forma de pago de lo que deja a cuenta" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Tarjeta"));
    expect(screen.getByText(/^Pendiente/).textContent).toMatch(/90,00\s€/);

    await act(async () => {
      fireEvent.click(create());
    });
    expect(posted()?.body.order).toMatchObject({
      serviceIds: ["s2"],
      totalPrice: 149,
      amountPaid: 59,
      paymentMethod: "card",
    });
  });

  it("warns about an open order with the same IMEI without blocking", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/clients/search")) return json([LUCIA]);
      if (url.includes("/devices/client/c1")) return json([IPHONE]);
      if (url.includes("/by-imei"))
        return json({
          openOrders: [{ id: "o1", code: "MP-0098", status: "en_progreso", createdAt: "2026-10-12T10:00:00Z" }],
          deliveries: [],
        });
      return json([]);
    });
    render(<IntakeForm />);
    await search("lucía");
    fireEvent.click(screen.getByRole("button", { name: /Lucía Fernández/ }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Apple iPhone 13/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/service-orders/by-imei?imei=356789104521337");
    expect(screen.getByRole("status").textContent).toContain("Tiene abierta la orden MP-0098 (En progreso, 12/10/2026)");
    expect(screen.getByRole("link", { name: "MP-0098" }).getAttribute("href")).toBe("/ordenes?orden=o1");

    fireEvent.click(screen.getByRole("button", { name: "Es otro caso, seguir con el alta" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("starts with the rate chosen in Tarifas when it comes in the address", async () => {
    window.history.replaceState(null, "", "/ordenes/nueva?servicio=s2");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/services/s2")) return json(SERVICES[1]);
      if (url.includes("/services")) return json(SERVICES);
      return json([]);
    });
    render(<IntakeForm />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Quitar Cambio de pantalla iPhone 13" })).toBeTruthy();
    expect(screen.getByLabelText("Total acordado")).toHaveProperty("value", "149,00");
    window.history.replaceState(null, "", "/");
  });

  it("starts filled in from an accepted quote and accepts it with the order", async () => {
    window.history.replaceState(null, "", "/ordenes/nueva?presupuesto=q1");
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/quotes/q1"))
        return json({
          id: "q1",
          code: "MP-P0031",
          clientName: "Lucía Fernández",
          clientPhone: "612 345 678",
          brand: "Apple",
          model: "iPhone 13",
          fault: "Pantalla rota",
          total: "160.00",
          lines: [{ serviceId: "s2", description: "Cambio de pantalla iPhone 13", unitPrice: "149.00" }],
        });
      if (url.includes("/clients/search")) return json([LUCIA]);
      if (init?.method === "POST") return json({ id: "o9" }, 201);
      return json([]);
    });
    render(<IntakeForm />);
    await act(async () => {});
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/clients/search?q=612345678");
    expect(screen.getByRole("status").textContent).toContain("Desde el presupuesto MP-P0031");
    expect(screen.getByLabelText("Total acordado")).toHaveProperty("value", "160,00");

    fireEvent.click(screen.getByLabelText("Pantalla rota"));
    await act(async () => {
      fireEvent.click(create());
    });
    expect(posted()?.body).toMatchObject({
      clientId: "c1",
      device: { brand: "Apple", model: "iPhone 13" },
      order: { serviceIds: ["s2"], totalPrice: 160, faultNotes: "Pantalla rota" },
      quoteId: "q1",
    });
    window.history.replaceState(null, "", "/");
  });
});
