import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IntakeForm } from "./IntakeForm";
import { SEARCH_DELAY_MS } from "./ClientPicker";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const LUCIA = { id: "c1", firstName: "Lucía", lastName: "Fernández", phoneNumber: "612345678", dniType: null, dni: null };
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
});
