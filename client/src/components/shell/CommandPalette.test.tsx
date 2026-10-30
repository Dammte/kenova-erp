import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CommandPalette, { fold } from "./CommandPalette";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const fetchMock = vi.fn();
const onClose = vi.fn();

const RESULT = {
  orders: [
    {
      id: "o1",
      code: "MP-0042",
      status: "en_progreso",
      clientName: "José Peña",
      device: "Apple iPhone 13",
    },
  ],
  clients: [{ id: "c1", name: "José Peña", phoneNumber: "612 345 678" }],
};

beforeEach(() => {
  vi.useFakeTimers();
  push.mockReset();
  onClose.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify(RESULT)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const field = () => screen.getByRole("combobox");
const options = () => screen.getAllByRole("option").map((o) => o.textContent);

async function type(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}

describe("CommandPalette", () => {
  it("opens focused on the field and lists the sections the role may visit", () => {
    render(<CommandPalette role="STORE_ADMIN" onClose={onClose} />);
    expect(document.activeElement).toBe(field());
    expect(options()).toEqual(["Nueva orden", "Ir a Panel", "Ir a Órdenes", "Ir a Clientes"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters the sections without accents and asks the server once typing stops", async () => {
    render(<CommandPalette role="SUPER_ADMIN" onClose={onClose} />);
    fireEvent.change(field(), { target: { value: "jo" } });
    fireEvent.change(field(), { target: { value: "jos" } });
    fireEvent.change(field(), { target: { value: "jose" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/search?q=jose");
    expect(options()).toEqual([
      "MP-0042 · José PeñaApple iPhone 13 · En progreso",
      "José Peña612 345 678",
    ]);

    await type("ordenes");
    expect(options()[0]).toBe("Ir a Órdenes");
  });

  it("moves with the arrows and opens with Enter", async () => {
    render(<CommandPalette role="SUPER_ADMIN" onClose={onClose} />);
    await type("jose");
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    expect(field().getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[1].id,
    );
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onClose).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/clients/c1");
  });

  it("says plainly when nothing matches", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ orders: [], clients: [] })));
    render(<CommandPalette role="SUPER_ADMIN" onClose={onClose} />);
    await type("zzz");
    expect(screen.getByRole("status").textContent).toBe(
      "Nada con «zzz». Prueba con el teléfono, el DNI o el nº de orden.",
    );
  });

  it("closes with Esc or a click outside", () => {
    const { container } = render(<CommandPalette role="SUPER_ADMIN" onClose={onClose} />);
    fireEvent.keyDown(field(), { key: "Escape" });
    fireEvent.mouseDown(container.firstChild as Element);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("fold", () => {
  it("ignores case and accents", () => {
    expect(fold("Órdenes")).toBe("ordenes");
  });
});
