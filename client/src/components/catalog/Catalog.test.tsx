import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { SessionUser } from "@/components/auth/AuthProvider";
import { CatalogPage } from "./CatalogPage";
import {
  duplicateGroups,
  filterModels,
  mergeSummary,
  suggestedKeep,
  type CatalogModel,
} from "./catalog";

let user: SessionUser;
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user }),
}));

const SUPER: SessionUser = {
  id: "u1",
  email: "ana@kenova.es",
  fullName: "Ana Rojo",
  role: "SUPER_ADMIN",
  storeId: null,
  mustChangePassword: false,
};
const APPLE = { id: "b1", name: "Apple" };
const model = (
  id: string,
  name: string,
  more: Partial<CatalogModel> = {},
): CatalogModel => ({
  id,
  name,
  brand: APPLE,
  deviceType: "movil",
  active: true,
  devices: 0,
  rates: 0,
  duplicates: [],
  ...more,
});
const IPHONE12 = model("m12", "iPhone 12", { devices: 31, rates: 6 });
const IPHONE13 = model("m13", "iPhone 13", {
  devices: 44,
  rates: 6,
  duplicates: ["m13b"],
});
const LOWER13 = model("m13b", "iphone 13", {
  devices: 3,
  deviceType: null,
  duplicates: ["m13"],
});
const IPHONE8 = model("m8", "iPhone 8", {
  active: false,
  devices: 4,
  rates: 1,
});
const ROWS = [IPHONE12, IPHONE13, LOWER13, IPHONE8];

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
let answer: () => Response;

beforeEach(() => {
  user = SUPER;
  answer = () => json({});
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    init?.method
      ? answer()
      : url.endsWith("/brands")
        ? json([{ id: "b2", name: "Samsung" }, APPLE])
        : json(ROWS),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function show() {
  render(<CatalogPage />);
  await act(async () => {});
}
const sent = () =>
  fetchMock.mock.calls
    .filter((c) => (c[1] as RequestInit | undefined)?.method)
    .map((c) => [
      (c[1] as RequestInit).method,
      c[0] as string,
      JSON.parse((c[1] as RequestInit).body as string),
    ]);

describe("CatalogPage", () => {
  it("lists the models with their type, devices and rates, and marks duplicates", async () => {
    await show();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    within(rows[1]).getByText("¿Duplicado?");
    within(rows[3]).getByText("Desactivado");
    expect(
      within(rows[1])
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toContain("44");
    expect(
      (screen.getByLabelText("Tipo de iphone 13") as HTMLSelectElement).value,
    ).toBe("");
    screen.getByText("Posibles duplicados: «iPhone 13» y «iphone 13» (Apple).");
  });

  it("finds a model ignoring capitals and spaces", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Buscar marca o modelo"), {
      target: { value: "IPHONE13" },
    });
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Buscar marca o modelo"), {
      target: { value: "pixel" },
    });
    screen.getByText("Ningún modelo coincide con «pixel».");
  });

  it("sets the type, withdraws and renames, then reloads", async () => {
    await show();
    fireEvent.change(screen.getByLabelText("Tipo de iphone 13"), {
      target: { value: "tablet" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reactivar iPhone 8" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Renombrar iPhone 12" }),
    );
    const form = screen.getByRole("form", { name: "Renombrar iPhone 12" });
    fireEvent.change(within(form).getByLabelText("Nuevo nombre"), {
      target: { value: "iPhone 12 mini " },
    });
    fireEvent.submit(form);
    await act(async () => {});
    expect(sent()).toEqual([
      ["PATCH", "/api/catalog/models/m13b", { deviceType: "tablet" }],
      ["PATCH", "/api/catalog/models/m8", { active: true }],
      ["PATCH", "/api/catalog/models/m12", { name: "iPhone 12 mini" }],
    ]);
    expect(
      screen.queryByRole("form", { name: "Renombrar iPhone 12" }),
    ).toBeNull();
    const loads = fetchMock.mock.calls.filter((c) => !c[1]?.method);
    expect(loads.length).toBeGreaterThan(1);
  });

  it("creates a model with its brand, name and type, then shows it", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo modelo" }));
    await act(async () => {});
    const form = screen.getByRole("form", { name: "Nuevo modelo" });
    const brand = within(form).getByLabelText("Marca") as HTMLSelectElement;
    expect([...brand.options].map((o) => o.textContent)).toEqual([
      "Elige la marca",
      "Apple",
      "Samsung",
    ]);
    expect(
      within(form).getByRole("button", { name: "Crear modelo" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(brand, { target: { value: "b1" } });
    fireEvent.change(within(form).getByLabelText("Modelo"), {
      target: { value: " iPad Air 5 " },
    });
    fireEvent.change(within(form).getByLabelText("Tipo · opcional"), {
      target: { value: "tablet" },
    });
    fireEvent.submit(form);
    await act(async () => {});
    expect(sent()).toEqual([
      [
        "POST",
        "/api/catalog/models",
        { brandId: "b1", name: "iPad Air 5", deviceType: "tablet" },
      ],
    ]);
    expect(screen.queryByRole("form", { name: "Nuevo modelo" })).toBeNull();
    expect(
      (screen.getByLabelText("Buscar marca o modelo") as HTMLInputElement).value,
    ).toBe("iPad Air 5");
  });

  it("a refused new model says why and keeps the form", async () => {
    answer = () => json({ message: "Ya existe «iPhone 13» en Apple." }, 409);
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Nuevo modelo" }));
    await act(async () => {});
    const form = screen.getByRole("form", { name: "Nuevo modelo" });
    fireEvent.change(within(form).getByLabelText("Marca"), { target: { value: "b1" } });
    fireEvent.change(within(form).getByLabelText("Modelo"), {
      target: { value: "iphone 13" },
    });
    fireEvent.submit(form);
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toBe("Ya existe «iPhone 13» en Apple.");
    expect(screen.getByRole("form", { name: "Nuevo modelo" })).toBeTruthy();
  });

  it("a refused rename says why and keeps the form open", async () => {
    answer = () =>
      json(
        {
          message:
            "Ya existe «iPhone 13» en Apple: únelos en vez de renombrar.",
        },
        409,
      );
    await show();
    fireEvent.click(
      screen.getByRole("button", { name: "Renombrar iPhone 12" }),
    );
    const form = screen.getByRole("form", { name: "Renombrar iPhone 12" });
    fireEvent.change(within(form).getByLabelText("Nuevo nombre"), {
      target: { value: "IPHONE 13" },
    });
    fireEvent.submit(form);
    await act(async () => {});
    screen.getByText(
      "Ya existe «iPhone 13» en Apple: únelos en vez de renombrar.",
    );
    screen.getByRole("form", { name: "Renombrar iPhone 12" });
  });

  it("merges duplicates into the one kept, the most used by default", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Revisar y unir" }));
    const panel = screen.getByRole("region", { name: "Unir duplicados" });
    within(panel).getByText(
      "«iphone 13» pasa a «iPhone 13» con 3 equipos y 0 tarifas, y desaparece de la lista.",
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Unir en «iPhone 13»" }),
    );
    await act(async () => {});
    expect(sent()).toEqual([
      ["POST", "/api/catalog/models/m13/merge", { fromId: "m13b" }],
    ]);
    expect(
      screen.queryByRole("region", { name: "Unir duplicados" }),
    ).toBeNull();
  });

  it("a refused merge says why and keeps the panel", async () => {
    answer = () =>
      json(
        {
          message:
            "No se ha podido unir: iphone 13 tiene la tarifa «Pantalla iPhone 13», que iPhone 13 ya tiene. Retira una de las dos en Tarifas antes de unir.",
        },
        409,
      );
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Revisar y unir" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Unir en «iPhone 13»" }),
    );
    await act(async () => {});
    screen.getByText(/Retira una de las dos en Tarifas/);
    screen.getByRole("region", { name: "Unir duplicados" });
  });

  it("a store is told the section belongs to the partners", async () => {
    user = { ...SUPER, role: "STORE_ADMIN", storeId: "s2" };
    await show();
    screen.getByText(/lo\s+gestionan los socios/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when the catalogue cannot load, and retries", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await act(async () => {});
    screen.getByRole("heading", { name: "Marcas y modelos" });
    expect(screen.getAllByRole("row")).toHaveLength(5);
  });
});

describe("catalog", () => {
  it("groups look-alikes once and suggests keeping the most used", () => {
    const groups = duplicateGroups(ROWS);
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([["m13", "m13b"]]);
    expect(suggestedKeep(groups[0]).id).toBe("m13");
    expect(mergeSummary(LOWER13, groups[0])).toBe(
      "«iPhone 13» pasa a «iphone 13» con 44 equipos y 6 tarifas, y desaparece de la lista.",
    );
  });

  it("searches brand and model together", () => {
    expect(filterModels(ROWS, "apple 8").map((r) => r.id)).toEqual(["m8"]);
    expect(filterModels(ROWS, "  ")).toHaveLength(4);
  });
});
