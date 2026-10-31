import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StatusMenu } from "./StatusMenu";

afterEach(cleanup);

const menu = (status: Parameters<typeof StatusMenu>[0]["status"], onChange = vi.fn()) =>
  render(<StatusMenu code="MP-0142" status={status} href="/serviceOrders/o1" onChange={onChange} />);

describe("StatusMenu", () => {
  it("offers the quick statuses and sends finishing or cancelling to the order", () => {
    const onChange = vi.fn();
    menu("en_progreso", onChange);
    fireEvent.click(screen.getByRole("button", { name: "En progreso: cambiar estado de MP-0142" }));
    screen.getByText("Cambiar estado de MP-0142");
    expect(screen.getByRole("button", { name: /En progreso/, current: true })).toBeTruthy();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toBe("/serviceOrders/o1");
    }
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

  it("finished, delivered and cancelled orders show a plain chip", () => {
    for (const status of ["finalizado", "entregado", "cancelado"] as const) {
      menu(status);
      expect(screen.queryByRole("button")).toBeNull();
      cleanup();
    }
  });
});
