import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Toast, TOAST_MS } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toast", () => {
  it("lasts 5 s, but waits while the pointer or the focus is on it", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const undo = vi.fn();
    render(<Toast text="MP-0138 pasa a Finalizado." undo={undo} onDone={onDone} />);
    const toast = screen.getByRole("status");

    act(() => vi.advanceTimersByTime(3000));
    fireEvent.mouseEnter(toast);
    expect(toast.hasAttribute("data-paused")).toBe(true);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(TOAST_MS - 3000 - 1));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(undo).toHaveBeenCalledOnce();
  });

  it("pauses while «Deshacer» has the keyboard focus", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Toast text="Hecho." undo={() => {}} onDone={onDone} />);
    fireEvent.focus(screen.getByRole("button", { name: "Deshacer" }));
    act(() => vi.advanceTimersByTime(TOAST_MS * 2));
    expect(onDone).not.toHaveBeenCalled();
  });
});
