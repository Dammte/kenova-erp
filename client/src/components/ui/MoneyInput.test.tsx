import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MoneyInput } from "./MoneyInput";

afterEach(cleanup);

function Harness({
  initial = null,
  max,
  spy,
}: {
  initial?: number | null;
  max?: number;
  spy: (v: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <MoneyInput
        label="Pago a cuenta"
        value={value}
        max={max}
        onChange={(v) => {
          spy(v);
          setValue(v);
        }}
      />
      <button type="button" onClick={() => setValue(70)}>
        Todo el saldo
      </button>
    </>
  );
}

const input = () => screen.getByRole("textbox", { name: "Pago a cuenta" });
const type = (text: string) =>
  fireEvent.change(input(), { target: { value: text } });

describe("MoneyInput", () => {
  it("reads a comma or a dot and tidies the amount on blur", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    type("12,5");
    expect(spy).toHaveBeenLastCalledWith(12.5);
    fireEvent.blur(input());
    expect((input() as HTMLInputElement).value).toBe("12,50");
    type("12.5");
    expect(spy).toHaveBeenLastCalledWith(12.5);
  });

  it("says what is wrong with an amount it cannot read", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    type("doce");
    expect(spy).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("Escribe un importe, por ejemplo 12,50.")).toBeTruthy();
    expect((input() as HTMLInputElement).value).toBe("doce");
  });

  it("refuses more than the balance", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} max={70} />);
    type("80");
    expect(spy).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(/^No puede pasar de 70,00/)).toBeTruthy();
    type("70");
    expect(spy).toHaveBeenLastCalledWith(70);
  });

  it("shows an amount set from outside", () => {
    render(<Harness spy={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Todo el saldo" }));
    expect((input() as HTMLInputElement).value).toBe("70,00");
  });
});
