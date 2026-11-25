import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SuppliersPage } from "./SuppliersPage";
import { emptySupplier, supplierBody, supplierDraftFrom, supplierSummary, validateSupplier, type SupplierData } from "./suppliers";

let params = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/proveedores",
  useSearchParams: () => params,
}));
let role: "SUPER_ADMIN" | "STORE_ADMIN" = "SUPER_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "me", role, storeId: null } }) }));

const supplier = (id: string, name: string, extra: Partial<SupplierData> = {}): SupplierData => ({
  id,
  name,
  taxId: null,
  customerNumber: null,
  contactName: null,
  email: null,
  phone: null,
  website: null,
  notes: null,
  active: true,
  ...extra,
});
const SUPPLIERS = [
  supplier("p1", "Repuestos Norte", { contactName: "Ane", phone: "944 000 000", customerNumber: "C-1042" }),
  supplier("p2", "Antiguo", { active: false }),
];

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sent = (method: string) => {
  const call = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === method);
  return call ? [call[0] as string, JSON.parse((call[1] as RequestInit).body as string)] : null;
};

beforeEach(() => {
  role = "SUPER_ADMIN";
  params = new URLSearchParams();
  replace.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/suppliers" && init?.method === "POST") return json({ id: "p9" }, 201);
    if (url === "/api/suppliers") return json(SUPPLIERS);
    if (url.startsWith("/api/suppliers/")) return json({ id: url.split("/")[3] });
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("supplier logic", () => {
  it("checks what the server would refuse, where the mistake is", () => {
    expect(validateSupplier({ ...emptySupplier(), name: "A", taxId: "12", email: "x", website: "norte.es", phone: "12" })).toEqual({
      name: "Escribe el nombre del proveedor",
      taxId: "CIF no válido",
      email: "Email no válido",
      website: "La web debe empezar por https://",
      phone: "Teléfono no válido",
    });
    expect(validateSupplier({ ...emptySupplier(), name: "Norte", taxId: "B-12345678", website: "https://norte.es" })).toEqual({});
  });

  it("sends only what changed", () => {
    const d = supplierDraftFrom(SUPPLIERS[0]);
    expect(supplierBody(d, d)).toEqual({});
    expect(supplierBody({ ...d, phone: " 600 111 222 " }, d)).toEqual({ phone: "600 111 222" });
    expect(Object.keys(supplierBody({ ...emptySupplier(), name: "X" }))).toHaveLength(8);
  });

  it("sums up the contact under the name", () => {
    expect(supplierSummary(SUPPLIERS[0])).toBe("Ane · 944 000 000 · nº cliente C-1042");
    expect(supplierSummary(SUPPLIERS[1])).toBe("");
  });
});

describe("Proveedores", () => {
  it("lists the suppliers and marks the deactivated ones", async () => {
    render(<SuppliersPage />);
    expect(await screen.findByText("Repuestos Norte")).toBeTruthy();
    expect(screen.getByText("Ane · 944 000 000 · nº cliente C-1042")).toBeTruthy();
    expect(screen.getByText("Desactivado")).toBeTruthy();
    expect(screen.getByText("Sin datos de contacto")).toBeTruthy();
  });

  it("creates one, refusing a bad email before sending", async () => {
    params = new URLSearchParams("proveedor=nuevo");
    render(<SuppliersPage />);
    fireEvent.change(await screen.findByLabelText(/Nombre/), { target: { value: "Piezas Sur" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pedidos" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Crear proveedor" })));
    expect(screen.getByText("Email no válido")).toBeTruthy();
    expect(sent("POST")).toBeNull();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pedidos@sur.es" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Crear proveedor" })));
    expect(sent("POST")).toEqual(["/api/suppliers", expect.objectContaining({ name: "Piezas Sur", email: "pedidos@sur.es" })]);
    expect(replace).toHaveBeenLastCalledWith("/proveedores?proveedor=p9", { scroll: false });
  });

  it("edits only what changed and deactivates after confirming", async () => {
    params = new URLSearchParams("proveedor=p1");
    render(<SuppliersPage />);
    const phone = await screen.findByLabelText("Teléfono");
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
    fireEvent.change(phone, { target: { value: "600 111 222" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" })));
    expect(sent("PATCH")).toEqual(["/api/suppliers/p1", { phone: "600 111 222" }]);

    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Desactivar…" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sí, desactivar" })));
    expect(sent("PATCH")).toEqual(["/api/suppliers/p1", { active: false }]);
  });

  it("shows the server's refusal", async () => {
    params = new URLSearchParams("proveedor=nuevo");
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json({ message: "Ya existe un proveedor «Norte»" }, 409)
        : json(url === "/api/suppliers" ? SUPPLIERS : {}),
    );
    render(<SuppliersPage />);
    fireEvent.change(await screen.findByLabelText(/Nombre/), { target: { value: "Norte" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Crear proveedor" })));
    expect(screen.getByRole("alert").textContent).toContain("Ya existe un proveedor «Norte»");
  });

  it("is only for the administrator", () => {
    role = "STORE_ADMIN";
    render(<SuppliersPage />);
    expect(screen.getByText(/Los proveedores los gestiona el administrador/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
