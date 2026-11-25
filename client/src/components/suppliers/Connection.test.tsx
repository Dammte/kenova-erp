import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SupplierConnection } from "./SupplierConnection";
import {
  connectionBody,
  connectionDraftFrom,
  emptyConnection,
  validateConnection,
  type SupplierConnection as Connection,
} from "./connection";
import type { SupplierData } from "./suppliers";

const CONNECTION: Connection = {
  baseUrl: "https://b2b.norte.es",
  login: { path: "/api/login", format: "json", userField: "email", passwordField: "password", session: "token", tokenPath: "data.token" },
  orders: {
    listPath: "/api/orders",
    itemsPath: "data.orders",
    detailPath: "/api/orders/{id}",
    idField: "id",
    numberField: "reference",
    dateField: null,
    linesPath: "lines",
    refField: "sku",
    descriptionField: "name",
    quantityField: "qty",
    unitCostField: "unit_price",
  },
};
const supplier = (extra: Partial<SupplierData> = {}): SupplierData => ({
  id: "p1",
  name: "Repuestos Norte",
  taxId: null,
  customerNumber: null,
  contactName: null,
  email: null,
  phone: null,
  website: null,
  notes: null,
  active: true,
  connection: null,
  credentialsUpdatedAt: null,
  ...extra,
});

const fetchMock = vi.fn();
const onSaved = vi.fn();
const sent = (method: string) => {
  const call = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === method);
  if (!call) return null;
  const body = (call[1] as RequestInit).body;
  return [call[0] as string, body ? JSON.parse(body as string) : undefined];
};

beforeEach(() => {
  fetchMock.mockReset();
  onSaved.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id: "p1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("connection logic", () => {
  it("round-trips what the server keeps", () => {
    expect(connectionBody(connectionDraftFrom(CONNECTION))).toEqual(CONNECTION);
    expect(connectionDraftFrom(null)).toEqual(emptyConnection());
  });

  it("drops the token place when the session goes by cookie, and the trailing slash", () => {
    const d = { ...connectionDraftFrom(CONNECTION), session: "cookie" as const, baseUrl: "https://b2b.norte.es/" };
    expect(connectionBody(d).login.tokenPath).toBeNull();
    expect(connectionBody(d).baseUrl).toBe("https://b2b.norte.es");
  });

  it("checks what the server would refuse, next to each field", () => {
    const d = {
      ...connectionDraftFrom(CONNECTION),
      baseUrl: "http://b2b.norte.es/api",
      loginPath: "//otra.web/login",
      listPath: "/api/../admin",
      detailPath: "/api/orders",
      idField: "id; x",
      tokenPath: "",
      quantityField: "",
    };
    expect(validateConnection(d)).toEqual({
      baseUrl: "Solo https:// y el dominio, sin rutas",
      loginPath: "Debe empezar por /",
      listPath: "No puede llevar «..»",
      detailPath: "Tiene que llevar {id}",
      idField: "Solo el nombre del campo, con puntos si va dentro de otro",
      tokenPath: "Obligatorio con sesión por token",
      quantityField: "Obligatorio",
    });
    expect(validateConnection(connectionDraftFrom(CONNECTION))).toEqual({});
  });
});

describe("Conexión con su web", () => {
  it("saves the routes and fields as a whole", async () => {
    render(<SupplierConnection supplier={supplier({ connection: CONNECTION })} onSaved={onSaved} />);
    expect(screen.queryByRole("button", { name: "Guardar conexión" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Ruta de la lista de pedidos/), { target: { value: "/api/v2/orders" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar conexión" })));
    expect(sent("PUT")).toEqual([
      "/api/suppliers/p1/connection",
      { ...CONNECTION, orders: { ...CONNECTION.orders, listPath: "/api/v2/orders" } },
    ]);
    expect(onSaved).toHaveBeenCalled();
  });

  it("asks for the token place only with a token session", () => {
    render(<SupplierConnection supplier={supplier()} onSaved={onSaved} />);
    expect(screen.queryByLabelText(/Dónde viene el token/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Sesión por token"));
    expect(screen.getByLabelText(/Dónde viene el token/)).toBeTruthy();
  });

  it("does not send an incomplete connection", async () => {
    render(<SupplierConnection supplier={supplier()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Dirección base/), { target: { value: "https://b2b.norte.es" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar conexión" })));
    expect(screen.getAllByText("Obligatorio").length).toBeGreaterThan(0);
    expect(sent("PUT")).toBeNull();
  });
});

describe("Credenciales de su web", () => {
  it("writes the login once and never shows it", async () => {
    render(<SupplierConnection supplier={supplier()} onSaved={onSaved} />);
    expect(screen.getByText("Sin credenciales.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: " compras@kenova.es " } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "S3creta!" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar credenciales" })));
    expect(sent("PUT")).toEqual(["/api/suppliers/p1/credentials", { username: "compras@kenova.es", password: "S3creta!" }]);
    expect(screen.getByLabelText("Contraseña").getAttribute("type")).toBe("password");
  });

  it("with a saved login shows only its date, and deletes it after confirming", async () => {
    render(<SupplierConnection supplier={supplier({ credentialsUpdatedAt: "2026-11-25T10:00:00Z" })} onSaved={onSaved} />);
    expect(screen.getByText("Guardadas el 25/11/2026")).toBeTruthy();
    expect(screen.queryByLabelText("Contraseña")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sí, borrar" })));
    expect(sent("DELETE")).toEqual(["/api/suppliers/p1/credentials", undefined]);
    expect(onSaved).toHaveBeenCalled();
  });
});
