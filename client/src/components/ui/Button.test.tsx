import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("is a plain secondary button by default", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Imprimir</Button>);
    const button = screen.getByRole("button", { name: "Imprimir" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("secondary");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("a disabled button always says why", () => {
    const onClick = vi.fn();
    render(
      <Button
        variant="primary"
        disabledReason="Asigna un técnico para finalizar"
        onClick={onClick}
      >
        Finalizar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Finalizar" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    const reason = screen.getByText("Asigna un técnico para finalizar");
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("while loading it is busy, disabled and shows the loading text", () => {
    render(
      <Button variant="primary" loading loadingText="Guardando…">
        Nueva orden
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Guardando…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("Nueva orden")).toBeNull();
  });
});
