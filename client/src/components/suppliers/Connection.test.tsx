import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SupplierConnection } from "./SupplierConnection";
import {
  PRESTASHOP,
  connectionBody,
  connectionDraftFrom,
  validateConnection,
  type SupplierConnection as Connection,
  type WebTestResult,
} from "./connection";
import type { SupplierData } from "./suppliers";

const CONNECTION: Connection = { ...PRESTASHOP, baseUrl: "https://rphoneb2b.com" };
const supplier = (extra: Partial<SupplierData> = {}): SupplierData => ({
  id: "p1",
  name: "RPhone",
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
  ordersSyncedAt: null,
  ...extra,
});
const TEST: WebTestResult = {
  ordersFound: 804,
  orders: [
    {
      externalId: "1001",
      reference: "ABCDEFGHI",
      date: "2026-11-25",
      total: "106.03",
      payment: "Tarjeta",
      status: "Pago aceptado",
      invoiceUrl: null,
      detailUrl: "https://rphoneb2b.com/index.php?controller=order-detail&id_order=1001",
    },
  ],
  sample: {
    order: {} as WebTestResult["orders"][number],
    lines: [
      {
        description: "Batería para Teléfono X",
        ref: "BT0001",
        productUrl: "https://rphoneb2b.com/busqueda?controller=search&s=BT0001",
        quantity: 2,
        unitPrice: "20.52",
        lineTotal: "41.04",
      },
    ],
  },
  warnings: [],
};
TEST.sample!.order = TEST.orders[0];

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
  fetchMock.mockImplementation(async (url: string) =>
    new Response(JSON.stringify(url.endsWith("/test") ? TEST : { id: "p1" }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("connection logic", () => {
  it("round-trips what the server keeps", () => {
    expect(connectionBody(connectionDraftFrom(CONNECTION))).toEqual(CONNECTION);
  });

  it("a new connection starts from PrestaShop's places and the supplier's web", () => {
    expect(connectionBody(connectionDraftFrom(null, "https://rphoneb2b.com/mi-cuenta"))).toEqual(CONNECTION);
    expect(connectionDraftFrom(null, "http://rphoneb2b.com").baseUrl).toBe("");
  });

  it("leaves empty optional places as null", () => {
    const d = { ...connectionDraftFrom(CONNECTION), "history.paymentSelector": " " };
    expect(connectionBody(d).history.paymentSelector).toBeNull();
  });

  it("checks what the server would refuse, next to each field", () => {
    const d = {
      ...connectionDraftFrom(CONNECTION),
      baseUrl: "http://rphoneb2b.com/api",
      "login.path": "//otra.web/login",
      "history.path": "/a/../admin",
      "history.rowSelector": "tr[",
      "history.idPattern": "id_order=\\d+",
      "detail.path": "/pedido",
      "detail.productSearchPath": "/busqueda",
      "detail.quantitySelector": "",
    };
    expect(validateConnection(d)).toEqual({
      baseUrl: "Solo https:// y el dominio, sin rutas",
      "login.path": "Debe empezar por /",
      "history.path": "No puede llevar «..»",
      "history.rowSelector": "No es un selector válido",
      "history.idPattern": "Una expresión con un solo grupo entre paréntesis",
      "detail.path": "Tiene que llevar {id}",
      "detail.productSearchPath": "Tiene que llevar {ref}",
      "detail.quantitySelector": "Obligatorio",
    });
    expect(validateConnection(connectionDraftFrom(CONNECTION))).toEqual({});
  });
});

describe("Conexión con su web", () => {
  it("a new one is proposed filled in, to be saved", async () => {
    render(<SupplierConnection supplier={supplier({ website: "https://rphoneb2b.com" })} onSaved={onSaved} />);
    expect((screen.getByLabelText(/Página del historial/) as HTMLInputElement).value).toBe("/historial-compra");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar conexión" })));
    expect(sent("PUT")).toEqual(["/api/suppliers/p1/connection", CONNECTION]);
    expect(onSaved).toHaveBeenCalled();
  });

  it("saves a changed page as a whole", async () => {
    render(<SupplierConnection supplier={supplier({ connection: CONNECTION })} onSaved={onSaved} />);
    expect(screen.queryByRole("button", { name: "Guardar conexión" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Página del historial/), { target: { value: "/order-history" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar conexión" })));
    expect(sent("PUT")).toEqual([
      "/api/suppliers/p1/connection",
      { ...CONNECTION, history: { ...CONNECTION.history, path: "/order-history" } },
    ]);
  });

  it("opens the places that have a mistake", async () => {
    render(<SupplierConnection supplier={supplier({ connection: CONNECTION })} onSaved={onSaved} />);
    const rows = screen.getByLabelText(/Filas del historial/);
    expect(rows.closest("details")?.open).toBe(false);
    fireEvent.change(rows, { target: { value: "tr[" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Guardar conexión" })));
    expect(rows.closest("details")?.open).toBe(true);
    expect(screen.getByText("No es un selector válido")).toBeTruthy();
    expect(sent("PUT")).toBeNull();
  });
});

describe("Probar conexión", () => {
  it("waits for the connection and the credentials", () => {
    render(<SupplierConnection supplier={supplier({ connection: CONNECTION })} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: /Probar conexión/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows what the ERP read: the history and the lines of the last order", async () => {
    render(
      <SupplierConnection
        supplier={supplier({ connection: CONNECTION, credentialsUpdatedAt: "2026-11-25T10:00:00Z" })}
        onSaved={onSaved}
      />,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Probar conexión/ })));
    expect(sent("POST")?.[0]).toBe("/api/suppliers/p1/test");
    expect(screen.getByText("804 pedidos en el historial.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "ABCDEFGHI" }).getAttribute("href")).toContain("id_order=1001");
    expect(screen.getByText("25/11/2026")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Batería para Teléfono X" }).getAttribute("href")).toContain("s=BT0001");
  });

  it("shows the website's refusal", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ message: "La web del proveedor no ha aceptado el usuario y la contraseña." }), {
          status: 400,
        }),
    );
    render(
      <SupplierConnection
        supplier={supplier({ connection: CONNECTION, credentialsUpdatedAt: "2026-11-25T10:00:00Z" })}
        onSaved={onSaved}
      />,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Probar conexión/ })));
    expect(screen.getByRole("alert").textContent).toContain("no ha aceptado el usuario y la contraseña");
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
