import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";
import AppError from "@/app/error";
import { OfflineBanner } from "./OfflineBanner";

const push = vi.fn();
const back = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back, replace }) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  push.mockReset();
  back.mockReset();
  replace.mockReset();
});

describe("error screens", () => {
  it("a link that leads nowhere goes straight to the Panel", () => {
    render(<NotFound />);
    screen.getByRole("heading", { name: "Te llevamos al Panel…" });
    expect(replace).toHaveBeenCalledWith("/panel");
  });

  it("a failure gives the time to tell a partner, and retries", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T17:42:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(<AppError error={new Error("boom")} reset={reset} />);
    screen.getByText(/dile la hora: 18:42\.$/);
    expect(screen.queryByText(/boom/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe("OfflineBanner", () => {
  beforeEach(() => vi.useFakeTimers());

  it("appears offline, retries every 5 s and goes away when the server answers", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    screen.getByText("Reintento automático en 5 s");
    for (let s = 0; s < 5; s++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
    expect(fetchMock).toHaveBeenCalledWith("/api/health", { cache: "no-store" });
    screen.getByText("Reintento automático en 5 s");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar ahora" }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("goes away as soon as the browser is back online", () => {
    render(<OfflineBanner />);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    screen.getByRole("status");
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
