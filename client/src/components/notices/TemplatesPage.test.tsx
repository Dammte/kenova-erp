import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TemplatesPage } from "./TemplatesPage";
import type { MessageTemplate } from "./notices";

let user: { id: string; role: "SUPER_ADMIN" | "STORE_ADMIN"; storeId: string | null } = {
  id: "u1",
  role: "SUPER_ADMIN",
  storeId: null,
};
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user }) }));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const STORES = [
  { id: "vc", name: "Kenova Villarcayo", isMain: false, isActive: true },
  { id: "mp", name: "Kenova Medina de Pomar", isMain: true, isActive: true },
];
const tpl = (over: Partial<MessageTemplate>): MessageTemplate => ({
  trigger: "ready",
  name: "Listo para recoger",
  when: "Al pasar a Finalizado",
  body: "Hola {nombre}, tu {modelo} está listo.[si saldo] Quedan {saldo}.[/si]\n{tienda}",
  isBase: true,
  updatedAt: null,
  updatedBy: null,
  ...over,
});
const TEMPLATES = [
  tpl({ trigger: "received", name: "Recibido", when: "Al crear la orden", body: "Hola {nombre}" }),
  tpl({}),
];

const calls = (method: string) =>
  fetchMock.mock.calls.filter((c) => ((c[1] as RequestInit | undefined)?.method ?? "GET") === method);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  user = { id: "u1", role: "SUPER_ADMIN", storeId: null };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TemplatesPage", () => {
  it("opens the workshop's «Listo para recoger» with a preview and saves a fixed text", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/stores")) return json(STORES);
      if (init?.method === "PUT") return json(tpl({ isBase: false }));
      return json(TEMPLATES);
    });
    render(<TemplatesPage />);
    await act(async () => {});
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/message-templates?storeId=mp");
    expect(screen.getByRole("combobox")).toHaveProperty("value", "mp");
    expect(screen.getByLabelText("Vista previa").textContent).toBe(
      "Hola Lucía, tu iPhone 13 está listo. Quedan 90,00 €.\nKenova Medina de Pomar",
    );

    const area = screen.getByLabelText("Texto del aviso");
    fireEvent.change(area, { target: { value: "Te quedan {precio}" } });
    expect(screen.getByRole("alert").textContent).toBe(
      "La variable {precio} no existe. Usa {saldo} para el importe pendiente.",
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Corrige el texto")).toBeTruthy();

    fireEvent.change(area, { target: { value: "Te quedan {saldo}" } });
    expect(screen.getByText(/Si la orden está pagada dirá «0,00 €»/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    const [url, init] = calls("PUT")[0];
    expect(url).toBe("/api/message-templates/ready");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ body: "Te quedan {saldo}", storeId: "mp" });
  });

  it("lets a partner copy a saved text to the other stores", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/stores")) return json(STORES);
      if (init?.method === "POST") return json({ stores: 1 });
      return json(TEMPLATES);
    });
    render(<TemplatesPage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Copiar a todas las tiendas" }));
    expect(screen.getByText("¿Usar este texto también en la otra tienda? Sustituye el que tenga.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    });
    expect(calls("POST")[0][0]).toBe("/api/message-templates/ready/copy-to-all");
    expect(screen.getByRole("status").textContent).toBe("Copiada a 1 tienda.");
  });

  it("lets a store restore its own text to the base one, and nothing more", async () => {
    user = { id: "u2", role: "STORE_ADMIN", storeId: "vc" };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/stores/vc")) return json(STORES[0]);
      if (init?.method === "DELETE") return json(tpl({}));
      return json([TEMPLATES[0], tpl({ isBase: false, body: "Ya está {nombre}", updatedBy: { fullName: "Ana R." } })]);
    });
    render(<TemplatesPage />);
    await act(async () => {});
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/message-templates");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copiar a todas las tiendas" })).toBeNull();
    expect(screen.getByText("Propia")).toBeTruthy();
    expect(screen.getByText(/cambiada por Ana R\./)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restaurar plantilla base" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    });
    expect(calls("DELETE")[0][0]).toBe("/api/message-templates/ready");
  });
});
