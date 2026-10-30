import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TextField } from "./TextField";

afterEach(cleanup);

describe("TextField", () => {
  it("is named by its visible label and describes its hint", () => {
    render(<TextField label="IMEI / nº de serie" hint="Marca *#06#" />);
    const input = screen.getByRole("textbox", { name: "IMEI / nº de serie" });
    const hint = screen.getByText("Marca *#06#");
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });

  it("an error replaces the hint and marks the field invalid", () => {
    render(
      <TextField
        label="Teléfono"
        prefix="+34"
        hint="9 cifras"
        error="Faltan cifras: un teléfono tiene 9 y hay 8."
      />,
    );
    const input = screen.getByRole("textbox", { name: "Teléfono" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const error = screen.getByText("Faltan cifras: un teléfono tiene 9 y hay 8.");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(screen.queryByText("9 cifras")).toBeNull();
    expect(screen.getByText("+34")).toBeTruthy();
  });
});
