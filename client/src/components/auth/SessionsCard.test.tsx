import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SessionsCard } from "./SessionsCard";

const logoutEverywhere = vi.fn();
vi.mock("./AuthProvider", () => ({ useAuth: () => ({ logoutEverywhere }) }));

afterEach(() => {
  cleanup();
  logoutEverywhere.mockReset();
});

describe("SessionsCard", () => {
  it("says how long a session lasts and closes them all, telling when it could not", async () => {
    logoutEverywhere.mockRejectedValueOnce(new Error("offline"));
    render(<SessionsCard />);
    screen.getByText(/últimas 24 horas, hasta un máximo de 30 días/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión en todos los equipos" }));
    });
    expect(logoutEverywhere).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toMatch(/^No se pudieron cerrar las sesiones/);
  });
});
