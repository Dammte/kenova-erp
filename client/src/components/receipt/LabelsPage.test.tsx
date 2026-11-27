import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { OrderDetail } from "@/components/orders/orderDetail";
import { LabelsPage, MAX_LABELS, readIds } from "./LabelsPage";

const order = (id: string, code: string) =>
  ({
    id,
    code,
    createdAt: "2026-10-29T09:57:00Z",
    reportedFaults: ["broken_screen"],
    client: { firstName: "Lucía", lastName: "Fernández Ortega", phoneNumber: "612 345 678" },
    device: { brand: "Apple", model: "iPhone 13" },
  }) as unknown as OrderDetail;

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("readIds", () => {
  it("takes the ids in order, without blanks or repeats, and at most a list page", () => {
    expect(readIds("?ids=a,b,,a, c")).toEqual(["a", "b", "c"]);
    expect(readIds("")).toEqual([]);
    const many = Array.from({ length: MAX_LABELS + 5 }, (_, i) => `id${i}`).join(",");
    expect(readIds(`?ids=${many}`)).toHaveLength(MAX_LABELS);
  });
});

describe("LabelsPage", () => {
  it("shows one sticker per order and says which could not be loaded", async () => {
    window.history.replaceState(null, "", "/ordenes/etiquetas?ids=o1,o2,o3");
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/o1")) return new Response(JSON.stringify(order("o1", "MP-0142")));
      if (url.endsWith("/o2")) return new Response(JSON.stringify(order("o2", "MP-0097")));
      return new Response("{}", { status: 404 });
    });
    render(<LabelsPage />);
    await act(async () => {});

    const labels = within(screen.getByRole("list", { name: "Etiquetas" })).getAllByRole("article", { name: "Etiqueta" });
    expect(labels.map((l) => l.querySelector("strong")?.textContent)).toEqual(["MP-0142", "MP-0097"]);
    screen.getByText("2 etiquetas de 62 × 29 mm");
    screen.getByText("Una orden no se ha podido cargar y no se imprimirá.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Imprimir/ }));
  });

  it("asks to pick orders when none came in the link", async () => {
    render(<LabelsPage />);
    await act(async () => {});
    screen.getByText(/No se ha elegido ninguna orden/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
