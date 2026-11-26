import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StatusMenu } from "./StatusMenu";

afterEach(cleanup);
beforeEach(() => {
  onFinish.mockClear();
  onOpen.mockClear();
});

const onFinish = vi.fn();
const onOpen = vi.fn();
const menu = (status: Parameters<typeof StatusMenu>[0]["status"], onChange = vi.fn()) =>
  render(<StatusMenu code="MP-0142" status={status} onChange={onChange} onFinish={onFinish} onOpen={onOpen} />);

describe("StatusMenu", () => {
  it("offers the quick statuses, «Finalizar…» in its dialog and «Cancelar…» in the order", () => {
    const onChange = vi.fn();
    menu("en_progreso", onChange);
    fireEvent.click(screen.getByRole("button", { name: "En progreso: cambiar estado de MP-0142" }));
    screen.getByText("Cambiar estado de MP-0142");
    expect(screen.getByRole("button", { name: /En progreso/, current: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Finalizar…/ }));
    expect(onFinish).toHaveBeenCalledOnce();
    expect(screen.queryByText("Cambiar estado de MP-0142")).toBeNull();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: /Cancelar…/ }));
    expect(onOpen).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "Pendiente de piezas" }));
    expect(onChange).toHaveBeenCalledWith("pendiente_piezas");
    expect(screen.queryByText("Cambiar estado de MP-0142")).toBeNull();
  });

  it("picking the current status changes nothing", () => {
    const onChange = vi.fn();
    menu("pendiente_cliente", onChange);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: /Pendiente cliente/, current: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes with Esc", () => {
    menu("en_progreso");
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Cambiar estado de MP-0142")).toBeNull();
  });

  it("a finished order goes back to work or is delivered from its panel", () => {
    const onChange = vi.fn();
    menu("finalizado", onChange);
    fireEvent.click(screen.getByRole("button", { name: "Finalizado: cambiar estado de MP-0142" }));
    expect(screen.queryByRole("button", { name: /Pendiente de piezas/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Finalizar…/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Entregar…/ }));
    expect(onOpen).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: "En progreso" }));
    expect(onChange).toHaveBeenCalledWith("en_progreso");
  });

  it("delivered and cancelled orders show a plain chip", () => {
    for (const status of ["entregado", "cancelado"] as const) {
      menu(status);
      expect(screen.queryByRole("button")).toBeNull();
      cleanup();
    }
  });
});
