import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FinishDialog } from "./FinishDialog";

let role: "SUPER_ADMIN" | "STORE_ADMIN" = "STORE_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1", role } }) }));

const ROW = { id: "o1", code: "MP-0142", clientName: "Lucía Fernández", device: "Apple iPhone 13" };
const STOCK = [{ id: "i1", sku: "SCR-IP13", name: "Pantalla iPhone 13", stock: 3 }];

const fetchMock = vi.fn();
let patchStatus = 200;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const onClose = vi.fn();
const onFinished = vi.fn();
const onOpen = vi.fn();

beforeEach(() => {
  role = "STORE_ADMIN";
  patchStatus = 200;
  for (const f of [onClose, onFinished, onOpen]) f.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/inventory") return json(STOCK);
    if (url === "/api/service-orders/o1" && init?.method === "PATCH")
      return patchStatus === 200 ? json({ id: "o1" }) : json({ message: "La orden está cancelada" }, patchStatus);
    if (url === "/api/service-orders/o1") return json({ id: "o1", workDone: null });
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = async () => {
  render(<FinishDialog row={ROW} onClose={onClose} onFinished={onFinished} onOpen={onOpen} />);
  await act(async () => {});
};
const patches = () =>
  fetchMock.mock.calls
    .filter(([, i]) => (i as RequestInit | undefined)?.method === "PATCH")
    .map(([, i]) => JSON.parse((i as RequestInit).body as string));

describe("«Finalizar» from the list", () => {
  it("asks for the work done before finishing", async () => {
    await show();
    screen.getByRole("dialog", { name: "Finalizar MP-0142" });
    screen.getByText("Lucía Fernández · Apple iPhone 13");
    expect(screen.getByRole("button", { name: "Finalizar orden" }).hasAttribute("disabled")).toBe(true);
    screen.getByText("Escribe el trabajo realizado.");
  });

  it("finishes with the work, tests and result, then offers to open the order", async () => {
    await show();
    fireEvent.change(screen.getByLabelText(/Trabajo realizado/), { target: { value: "Pantalla cambiada" } });
    fireEvent.click(screen.getByLabelText("Táctil"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finalizar orden" }));
    });
    expect(patches()).toEqual([
      { status: "finalizado", workDone: "Pantalla cambiada", testsDone: ["touch"], result: "repaired", notRepairedReason: null },
    ]);
    expect(onFinished).toHaveBeenCalledOnce();
    screen.getByRole("dialog", { name: "MP-0142 finalizada" });
    fireEvent.click(screen.getByRole("button", { name: "Abrir la orden" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("starts from the work already written when the order was reopened", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === "/api/service-orders/o1" ? json({ id: "o1", workDone: "Batería cambiada" }) : json({}, 404),
    );
    await show();
    expect((screen.getByLabelText(/Trabajo realizado/) as HTMLTextAreaElement).value).toBe("Batería cambiada");
  });

  it("a store does not see stock; a partner takes the parts used out of it", async () => {
    await show();
    expect(screen.queryByLabelText("Buscar pieza del inventario")).toBeNull();
    cleanup();

    role = "SUPER_ADMIN";
    await show();
    fireEvent.change(screen.getByLabelText(/Trabajo realizado/), { target: { value: "Pantalla cambiada" } });
    fireEvent.change(screen.getByLabelText("Buscar pieza del inventario"), { target: { value: "pantalla" } });
    fireEvent.click(screen.getByRole("button", { name: /Pantalla iPhone 13 · SCR-IP13 · stock 3/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finalizar orden" }));
    });
    expect(patches()[0]).toMatchObject({ parts: [{ inventoryId: "i1", quantity: 1 }] });
  });

  it("says why the server refused, and stays open", async () => {
    patchStatus = 400;
    await show();
    fireEvent.change(screen.getByLabelText(/Trabajo realizado/), { target: { value: "Pantalla cambiada" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Finalizar orden" }));
    });
    expect(screen.getByRole("alert").textContent).toBe("La orden está cancelada");
    expect(onFinished).not.toHaveBeenCalled();
    screen.getByRole("dialog", { name: "Finalizar MP-0142" });
  });

  it("Ctrl+Intro confirms and Esc closes", async () => {
    await show();
    const work = screen.getByLabelText(/Trabajo realizado/);
    fireEvent.change(work, { target: { value: "Pantalla cambiada" } });
    await act(async () => {
      fireEvent.keyDown(work, { key: "Enter", ctrlKey: true });
    });
    expect(patches()).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
