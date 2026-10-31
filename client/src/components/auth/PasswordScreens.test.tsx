import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { ResetPasswordForm } from "./ResetPasswordForm";

const fetchMock = vi.fn();
const ok = () => Promise.resolve(new Response("{}", { status: 200 }));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(ok);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("ForgotPasswordForm", () => {
  it("answers the same whether or not the email has an account", async () => {
    render(<ForgotPasswordForm />);
    type("Email", "ana@kenova.es");
    fireEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));
    expect((await screen.findByRole("status")).textContent).toMatch(
      /^Si ese email tiene cuenta en Kenova/,
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "ana@kenova.es" });
  });
});

describe("ResetPasswordForm", () => {
  it("a link without a token offers to ask for another one", async () => {
    render(<ResetPasswordForm />);
    expect(await screen.findByRole("heading", { name: "Enlace no válido" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Pedir otro enlace" }).getAttribute("href"),
    ).toBe("/recuperar-contrasena");
  });

  it("sends the token from the link with the new password", async () => {
    window.location.hash = "#token=abc_123";
    render(<ResetPasswordForm />);
    type("Contraseña nueva", "tres gatos azules");
    type("Repite la contraseña", "tres gatos azules");
    fireEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByRole("heading", { name: "Contraseña cambiada" })).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      token: "abc_123",
      newPassword: "tres gatos azules",
    });
    expect(window.location.hash).toBe("");
  });
});

describe("ChangePasswordForm", () => {
  it("first access: temporary password, then straight into the app", async () => {
    const navigate = vi.fn();
    render(<ChangePasswordForm firstAccess navigate={navigate} />);
    expect(screen.getByRole("heading", { name: "Elige una contraseña nueva" })).toBeTruthy();
    const save = () => screen.getByRole("button", { name: "Guardar y entrar" });
    expect(save().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Escribe la contraseña temporal.")).toBeTruthy();
    type("Contraseña temporal", "Temporal-2026");
    type("Contraseña nueva", "tres gatos azules");
    type("Repite la contraseña", "tres gatos azules");
    expect(save().hasAttribute("disabled")).toBe(false);
    fireEvent.click(save());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/panel"));
  });

  it("from the menu: shows the server's reason when it refuses", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "La contraseña actual no es correcta" }), {
        status: 400,
      }),
    );
    render(<ChangePasswordForm firstAccess={false} />);
    type("Contraseña actual", "mala");
    type("Contraseña nueva", "tres gatos azules");
    type("Repite la contraseña", "tres gatos azules");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "La contraseña actual no es correcta",
    );
  });
});
