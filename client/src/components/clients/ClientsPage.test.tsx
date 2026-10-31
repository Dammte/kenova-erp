import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ClientsPage } from "./ClientsPage";
import { documentProblem, formatDoc, formatPhone, initials } from "./clients";

let params = new URLSearchParams();
const replace = vi.fn((url: string) => {
  params = new URLSearchParams(url.split("?")[1] ?? "");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/clientes",
  useSearchParams: () => params,
}));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const calls = () => fetchMock.mock.calls.map((c) => [c[0] as string, (c[1] as RequestInit | undefined)?.method ?? "GET"]);

const LUCIA = {
  id: "c1",
  firstName: "Lucía",
  lastName: "Fernández",
  phoneNumber: "612345678",
  dniType: "NIF",
  dni: "12345678Z",
  orders: 3,
  lastVisit: "2026-10-28",
  balance: "59.00",
  duplicate: true,
};
const PAGE = { total: 1, page: 1, pageSize: 50, rows: [LUCIA] };
const DATA = { ...LUCIA, email: null, address: null, postalCode: null, city: "Medina", isActive: true, createdAt: "2025-03-02T10:00:00Z" };
const SUMMARY = {
  stats: { orders: 3, spent: "408.00", balance: "59.00", open: 1, lastVisit: "2026-10-28" },
  devices: [{ id: "d1", type: "movil", brand: "Apple", model: "iPhone 13", imei: "356789104521337", orders: 2 }],
  history: {
    total: 1,
    rows: [{ id: "o1", code: "MP-0142", model: "iPhone 13", faults: ["battery"], date: "2026-10-28", status: "en_progreso", totalPrice: "89.00" }],
  },
};
const TWIN = { ...DATA, id: "c2", firstName: "Lucia", lastName: "Fernandez", orders: 1, firstVisit: "2024-05-01", samePhone: true };

beforeEach(() => {
  params = new URLSearchParams();
  replace.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" || init?.method === "PUT") return new Response(null, { status: init.method === "PUT" ? 200 : 204 });
    if (url.startsWith("/api/clients/list")) return json(PAGE);
    if (url.endsWith("/clients/c1")) return json(DATA);
    if (url.endsWith("/c1/summary")) return json(SUMMARY);
    if (url.endsWith("/c1/duplicates")) return json([TWIN]);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("client helpers", () => {
  it("writes phones, documents and initials, and checks the NIF letter", () => {
    expect(formatPhone("612345678")).toBe("612 345 678");
    expect(formatPhone("+33 6 12")).toBe("+33 6 12");
    expect(formatDoc({ dniType: "PASSPORT", dni: "AB123" })).toBe("Pasaporte AB123");
    expect(initials({ firstName: "lucía", lastName: "Fernández" })).toBe("LF");
    expect(documentProblem("NIF", "12345678Z")).toBeNull();
    expect(documentProblem("NIF", "12345678A")).toBe("La letra no corresponde a este NIF.");
    expect(documentProblem("NIE", "X1234567L")).toBeNull();
    expect(documentProblem("NIF", "1234")).toBe("Un NIF son 8 cifras y una letra.");
    expect(documentProblem("PASSPORT", "loquesea")).toBeNull();
  });
});

describe("ClientsPage", () => {
  it("lists clients with what they owe and flags a possible twin", async () => {
    render(<ClientsPage />);
    await act(async () => {});
    const row = screen.getByRole("row", { name: /Lucía Fernández/ });
    within(row).getByText("¿Duplicado?");
    expect(row.textContent).toContain("612 345 678 · NIF 12345678Z");
    expect(within(row).getByText(/^59,00\s€$/)).toBeTruthy();
    screen.getByText("1 cliente activos");
  });

  it("searches once the user stops typing and keeps the search in the address", async () => {
    vi.useFakeTimers();
    render(<ClientsPage />);
    await act(async () => {});
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar cliente" }), { target: { value: "612" } });
    expect(replace).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(replace).toHaveBeenCalledWith("/clientes?q=612", { scroll: false });
  });

  it("shows how clients are created when there are none", async () => {
    fetchMock.mockImplementation(async () => json({ total: 0, page: 1, pageSize: 50, rows: [] }));
    render(<ClientsPage />);
    await act(async () => {});
    screen.getByText("Los clientes se crean al dar de alta un equipo.");
    expect(screen.getByRole("link", { name: "Ir a Alta rápida" }).getAttribute("href")).toBe("/ordenes/nueva");
  });

  it("opens the card with its figures, devices, history and actions", async () => {
    params = new URLSearchParams("cliente=c1");
    render(<ClientsPage />);
    await act(async () => {});
    const card = screen.getByRole("complementary", { name: "Ficha de Lucía Fernández" });
    expect(within(card).getByText("Saldo pendiente").nextSibling?.textContent).toMatch(/^59,00\s€$/);
    within(card).getByText("iPhone 13", { selector: "strong" });
    expect(within(card).getByRole("link", { name: /MP-0142/ }).getAttribute("href")).toBe("/ordenes?orden=o1");
    expect(within(card).getByRole("link", { name: "Llamar" }).getAttribute("href")).toBe("tel:612345678");
    expect(within(card).getByRole("link", { name: "+ Nueva alta para este cliente" }).getAttribute("href")).toBe(
      "/ordenes/nueva?cliente=c1",
    );
    within(card).getByText(/Posible duplicado: «Lucia Fernandez» tiene el mismo teléfono/);

    fireEvent.click(within(card).getByRole("button", { name: "Cerrar ficha" }));
    expect(replace).toHaveBeenCalledWith("/clientes", { scroll: false });
  });

  it("archives a client and dismisses a false twin", async () => {
    params = new URLSearchParams("cliente=c1");
    render(<ClientsPage />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "No es la misma persona" }));
    });
    const dismiss = fetchMock.mock.calls.find((c) => (c[0] as string).endsWith("/not-duplicate"));
    expect(JSON.parse((dismiss?.[1] as RequestInit).body as string)).toEqual({ otherId: "c2" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    });
    expect(calls()).toContainEqual(["/api/clients/c1/archive", "POST"]);
    screen.getByText("Lucía Fernández archivado. Sus órdenes se conservan.");
  });

  it("edits the data in place, sends only what changed and warns about a wrong NIF letter", async () => {
    params = new URLSearchParams("cliente=c1");
    render(<ClientsPage />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Ciudad"), { target: { value: "Valladolid" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Documento" }), { target: { value: "12345678A" } });
    screen.getByText("La letra no corresponde a este NIF.");
    fireEvent.change(screen.getByRole("textbox", { name: "Documento" }), { target: { value: "12345678Z" } });
    expect(screen.queryByText("La letra no corresponde a este NIF.")).toBeNull();

    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Ciudad"), { key: "Enter", ctrlKey: true });
    });
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(put?.[0]).toBe("/api/clients/c1");
    expect(JSON.parse((put?.[1] as RequestInit).body as string)).toEqual({ city: "Valladolid" });
    screen.getByText("Datos guardados");
  });
});
