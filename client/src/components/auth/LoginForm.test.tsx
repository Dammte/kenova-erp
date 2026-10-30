import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginForm, safeNext } from "./LoginForm";

const fetchMock = vi.fn();

function reply(status: number, body: unknown = {}) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) =>
    url.endsWith("/password-reset/available")
      ? reply(200, { available: false })
      : reply(401),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: password },
  });
}

describe("LoginForm", () => {
  it("says what is missing instead of a silently disabled button", () => {
    render(<LoginForm next={null} />);
    const button = screen.getByRole("button", { name: "Entrar" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Escribe tu email.")).toBeTruthy();
    fill("ana@kenova.es", "");
    expect(screen.getByText("Escribe tu contraseña.")).toBeTruthy();
  });

  it("shows and hides the password", () => {
    render(<LoginForm next={null} />);
    const input = screen.getByLabelText("Contraseña");
    expect(input.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(input.getAttribute("type")).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(input.getAttribute("type")).toBe("password");
  });

  it("warns when Caps Lock is on", () => {
    render(<LoginForm next={null} />);
    const input = screen.getByLabelText("Contraseña");
    fireEvent.keyDown(input, { key: "A", modifierCapsLock: true });
    expect(screen.getByText("Bloq Mayús está activado.")).toBeTruthy();
    fireEvent.keyUp(input, { key: "CapsLock", modifierCapsLock: false });
    expect(screen.queryByText("Bloq Mayús está activado.")).toBeNull();
  });

  it("a wrong password gets a neutral message and clears the field", async () => {
    render(<LoginForm next={null} />);
    fill("ana@kenova.es", "mala");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /^El email o la contraseña no son correctos/,
    );
    expect((screen.getByLabelText("Contraseña") as HTMLInputElement).value).toBe("");
  });

  it("goes to the requested page, or to change the password first", async () => {
    const navigate = vi.fn();
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("/login")
        ? reply(200, { user: { mustChangePassword: false } })
        : reply(200, { available: true }),
    );
    render(<LoginForm next="/clients" navigate={navigate} />);
    expect(await screen.findByText("¿Olvidaste tu contraseña?")).toBeTruthy();
    fill("ana@kenova.es", "buena");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/clients"));

    fetchMock.mockImplementation(() =>
      reply(200, { user: { mustChangePassword: true } }),
    );
    fill("ana@kenova.es", "temporal");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() =>
      expect(navigate).toHaveBeenLastCalledWith("/cuenta/contrasena"),
    );
  });
});

describe("safeNext", () => {
  it("only accepts same-site paths", () => {
    expect(safeNext("/clients")).toBe("/clients");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("/login?next=/x")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });
});
