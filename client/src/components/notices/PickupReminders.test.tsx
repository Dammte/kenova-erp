import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PickupReminders, type PickupReminder } from "./PickupReminders";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const row = (over: Partial<PickupReminder>): PickupReminder => ({
  id: "o1",
  code: "MP-0097",
  storeId: "st1",
  storeName: "Kenova Medina",
  firstName: "Alba",
  clientName: "Alba Moreno",
  phone: "634 112 908",
  model: "iPad 9",
  totalPrice: "80.00",
  balance: "0.00",
  days: 31,
  trigger: "reminder_30",
  ...over,
});
const TEMPLATES = [
  { trigger: "reminder_15", name: "Recordatorio 15 días", when: "", body: "Hola {nombre}, 15 días.", isBase: true, updatedAt: null, updatedBy: null },
  {
    trigger: "reminder_30",
    name: "Recordatorio 30 días",
    when: "",
    body: "Hola {nombre}, tu {modelo} ({orden}) lleva 30 días en {tienda}.[si saldo] Quedan {saldo}.[/si]",
    isBase: true,
    updatedAt: null,
    updatedBy: null,
  },
];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PickupReminders", () => {
  it("shows nothing when no reminder is due", async () => {
    fetchMock.mockResolvedValue(json([]));
    const { container } = render(<PickupReminders />);
    await act(async () => {});
    expect(container.textContent).toBe("");
  });

  it("sends a due reminder through WhatsApp and takes it off the queue", async () => {
    const openWindow = vi.fn();
    vi.stubGlobal("open", openWindow);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/notices/reminders")
        return json([row({}), row({ id: "o2", code: "MP-0110", clientName: "Rubén Castro", days: 16, trigger: "reminder_15", phone: null })]);
      if (url.startsWith("/api/message-templates")) return json(TEMPLATES);
      if (init?.method === "POST") return json({}, 201);
      return json([]);
    });
    render(<PickupReminders />);
    await act(async () => {});
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/message-templates?storeId=st1");
    screen.getByText("31 días sin recoger · iPad 9");
    screen.getByText("Sin teléfono: llamar");
    expect(screen.getByRole("link", { name: "MP-0097" }).getAttribute("href")).toBe("/ordenes?orden=o1");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar recordatorio a Alba Moreno" }));
    });
    const text = "Hola Alba, tu iPad 9 (MP-0097) lleva 30 días en Kenova Medina.";
    expect(openWindow).toHaveBeenCalledWith(
      `https://wa.me/34634112908?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(post?.[0]).toBe("/api/service-orders/o1/notices");
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ trigger: "reminder_30", body: text });
    expect(screen.queryByText("MP-0097")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Recordatorio de MP-0097 apuntado en la orden.");
  });
});
