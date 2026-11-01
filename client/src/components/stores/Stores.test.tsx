import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { StoresPage } from "./StoresPage";
import {
  commissionExample,
  commissionLabel,
  emptyStore,
  storeBody,
  storeDraftFrom,
  validateStore,
  type StoreData,
} from "./stores";

let params = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/tienda",
  useSearchParams: () => params,
}));
let role: "SUPER_ADMIN" | "STORE_ADMIN" = "SUPER_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "me", role, storeId: null } }) }));

const store = (id: string, name: string, prefix: string, extra: Partial<StoreData> = {}): StoreData => ({
  id,
  name,
  city: name,
  prefix,
  address: null,
  phone: null,
  legalName: null,
  taxId: null,
  cashOpensAt: "09:00:00",
  cashClosesAt: "20:00:00",
  cashFloat: "100.00",
  warrantyDays: 90,
  commissionType: "percent",
  commissionValue: "15.00",
  isMain: false,
  nextOrderNumber: 1,
  isActive: true,
  ...extra,
});
const STORES = [
  store("s1", "Medina de Pomar", "MP", { isMain: true, commissionType: null, commissionValue: null, nextOrderNumber: 1241 }),
  store("s2", "Villarcayo", "VC", { nextOrderNumber: 43 }),
  store("s3", "Espinosa", "ES", { commissionType: "fixed", commissionValue: "8.00", nextOrderNumber: 8 }),
];
const USERS = [
  { id: "me", fullName: "Ana Rojo", role: "SUPER_ADMIN", storeId: null, isActive: true },
  { id: "u2", fullName: "Marta Ibáñez", role: "STORE_ADMIN", storeId: "s2", isActive: true },
];

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  role = "SUPER_ADMIN";
  params = new URLSearchParams();
  replace.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/stores" && init?.method === "POST") return json({ id: "s9" }, 201);
    if (url === "/api/stores") return json(STORES);
    if (url === "/api/users") return json(USERS);
    if (url.endsWith("/commission-history"))
      return json([
        { id: "h2", type: "percent", value: "15.00", createdAt: "2026-09-01T10:00:00Z", changedBy: { id: "me", fullName: "Ana Rojo" } },
        { id: "h1", type: "percent", value: "12.00", createdAt: "2026-03-10T10:00:00Z", changedBy: null },
      ]);
    if (url.startsWith("/api/stores/")) return json({ id: url.split("/")[3] });
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sent = (method: string) => {
  const call = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === method);
  return call ? [call[0] as string, JSON.parse((call[1] as RequestInit).body as string)] : null;
};

describe("store logic", () => {
  it("labels the commission and gives the 129,00 € example", () => {
    expect(commissionLabel("percent", "15.00")).toBe("15 %");
    expect(commissionLabel("fixed", "8.00").replace(/\s/g, " ")).toBe("8,00 €/equipo");
    expect(commissionLabel(null, null)).toBe("sin comisión");
    expect(commissionExample("percent", 15)?.replace(/\s/g, " ")).toBe(
      "Ejemplo: una reparación de 129,00 € cobrada genera 19,35 € de comisión.",
    );
  });

  it("sends only what changed, and the commission's type and value together", () => {
    const d = storeDraftFrom(STORES[1]);
    expect(storeBody(d, d)).toEqual({});
    expect(storeBody({ ...d, address: " Calle Mayor 1 " }, d)).toEqual({ address: "Calle Mayor 1" });
    expect(storeBody({ ...d, commissionValue: 12 }, d)).toEqual({ commissionType: "percent", commissionValue: 12 });
    expect(storeBody({ ...d, commissionType: null }, d)).toEqual({ commissionType: null, commissionValue: null });
    // The workshop never sends a commission.
    const main = storeDraftFrom(STORES[0]);
    expect(storeBody(main, undefined, true)).not.toHaveProperty("commissionType");
  });

  it("checks what the server would refuse, where the mistake is", () => {
    expect(
      validateStore({ ...emptyStore(), cashOpensAt: "20:00", cashClosesAt: "09:00", warrantyDays: "30", commissionValue: 120 }, false),
    ).toEqual({
      name: "Escribe el nombre de la tienda.",
      city: "Escribe la ciudad.",
      prefix: "De 2 a 4 letras, por ejemplo VC.",
      cashClosesAt: "La hora de cierre debe ser posterior a la de apertura.",
      warrantyDays: "Al menos 90 días: es el mínimo legal.",
      commissionValue: "El porcentaje no puede pasar de 100.",
    });
  });
});

describe("StoresPage", () => {
  it("lists the stores with orders, commission and who works there", async () => {
    render(<StoresPage />);
    await act(async () => {});
    const list = screen.getByRole("region", { name: "Tiendas" });
    within(list).getByText("1240 órdenes");
    within(list).getByText(/42 órdenes · 15 % · Marta Ibáñez/);
    within(list).getByText(/7 órdenes · 8,00 €\/equipo/);
    within(within(list).getByRole("button", { name: /Espinosa/ })).getByText(/sin usuario/);
    // The workshop opens first and has no commission section.
    const card = screen.getByRole("complementary", { name: "Tienda Medina de Pomar" });
    expect(within(card).queryByText("Comisión de la tienda")).toBeNull();
  });

  it("keeps the prefix of a store with orders and saves only what changed", async () => {
    params = new URLSearchParams("tienda=s2");
    render(<StoresPage />);
    await act(async () => {});
    const card = screen.getByRole("complementary", { name: "Tienda Villarcayo" });
    within(card).getByText("Fijo: ya hay 42 órdenes con VC-");
    expect((within(card).getByLabelText(/^Prefijo/) as HTMLInputElement).readOnly).toBe(true);
    within(card).getByText("Marta Ibáñez");
    within(card).getByText("01/09/2026");
    expect(within(card).queryByRole("button", { name: "Guardar cambios" })).toBeNull();

    fireEvent.change(within(card).getByRole("textbox", { name: /^Porcentaje/ }), { target: { value: "12,5" } });
    within(card).getByText(/genera 16,13\s€ de comisión\.$/);
    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Guardar cambios" }));
    });
    expect(sent("PATCH")).toEqual(["/api/stores/s2", { commissionType: "percent", commissionValue: 12.5 }]);
  });

  it("asks before deactivating a store", async () => {
    params = new URLSearchParams("tienda=s3");
    render(<StoresPage />);
    await act(async () => {});
    const card = screen.getByRole("complementary", { name: "Tienda Espinosa" });
    within(card).getByText("Sin usuario: nadie puede entrar en esta tienda todavía.");
    fireEvent.click(within(card).getByRole("button", { name: "Desactivar…" }));
    expect(sent("PATCH")).toBeNull();
    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Sí, desactivar" }));
    });
    expect(sent("PATCH")).toEqual(["/api/stores/s3", { isActive: false }]);
  });

  it("creates a store with its prefix and commission", async () => {
    params = new URLSearchParams("tienda=nueva");
    render(<StoresPage />);
    await act(async () => {});
    const card = screen.getByRole("complementary", { name: "Nueva tienda" });
    fireEvent.change(within(card).getByLabelText(/^Nombre/), { target: { value: "Trespaderne" } });
    fireEvent.change(within(card).getByLabelText(/^Ciudad/), { target: { value: "Trespaderne" } });
    fireEvent.change(within(card).getByLabelText(/^Prefijo/), { target: { value: "tr" } });
    fireEvent.click(within(card).getByRole("button", { name: "Crear tienda" }));
    within(card).getByText("Escribe el valor de la comisión.");
    fireEvent.change(within(card).getByRole("textbox", { name: /^Porcentaje/ }), { target: { value: "12" } });
    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Crear tienda" }));
    });
    expect(sent("POST")).toEqual([
      "/api/stores",
      expect.objectContaining({ name: "Trespaderne", prefix: "TR", commissionType: "percent", commissionValue: 12, warrantyDays: 90 }),
    ]);
    expect(replace).toHaveBeenLastCalledWith("/tienda?tienda=s9", { scroll: false });
  });

  it("keeps store accounts out", () => {
    role = "STORE_ADMIN";
    render(<StoresPage />);
    screen.getByText("Sin permiso.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
