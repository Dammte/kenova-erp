import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { NewPasswordFields, newPasswordProblem } from "./NewPasswordFields";

afterEach(cleanup);

function Harness() {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  return (
    <NewPasswordFields
      password={password}
      repeat={repeat}
      onPassword={setPassword}
      onRepeat={setRepeat}
    />
  );
}

describe("newPasswordProblem", () => {
  it("says what is missing, in order", () => {
    expect(newPasswordProblem("", "")).toBe("Escribe la contraseña nueva.");
    expect(newPasswordProblem("corta", "")).toBe("Faltan 7 caracteres: el mínimo es 12.");
    expect(newPasswordProblem("casi doce c", "")).toBe("Falta 1 carácter: el mínimo es 12.");
    expect(newPasswordProblem("tres gatos azules", "")).toBe("Repite la contraseña nueva.");
    expect(newPasswordProblem("tres gatos azules", "tres gatos")).toBe(
      "Las dos contraseñas no coinciden.",
    );
    expect(newPasswordProblem("tres gatos azules", "tres gatos azules")).toBeUndefined();
  });
});

describe("NewPasswordFields", () => {
  it("flags a mismatch as soon as the repeat goes wrong, not while it is being typed", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Contraseña nueva"), {
      target: { value: "tres gatos azules" },
    });
    const repeat = screen.getByLabelText("Repite la contraseña");
    fireEvent.change(repeat, { target: { value: "tres ga" } });
    expect(repeat.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(repeat, { target: { value: "tres gp" } });
    expect(repeat.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("No coinciden. Vuelve a escribirla.")).toBeTruthy();
  });

  it("one button shows or hides both fields", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(screen.getByLabelText("Contraseña nueva").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Repite la contraseña").getAttribute("type")).toBe("text");
  });
});
