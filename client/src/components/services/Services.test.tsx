import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ServicesPage } from "./ServicesPage";
import { ServiceForm } from "./ServiceForm";
import { categoryCounts, filterCatalog, modelLabel, serviceBody, serviceDraftFrom, type CatalogRow, type ServiceData } from "./services";

let params = new URLSearchParams();
const replace = vi.fn((url: string) => {
  params = new URLSearchParams(url.split("?")[1] ?? "");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/servicios",
  useSearchParams: () => params,
}));
let role: "SUPER_ADMIN" | "STORE_ADMIN" = "SUPER_ADMIN";
vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1", role, storeId: null } }) }));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const row = (id: string, name: string, category: string | null, price: string, extra: Partial<CatalogRow> = {}): CatalogRow => ({
  id,
  name,
  description: null,
  category,
  price,
  estimatedTime: null,
  available: true,
  quality: null,
  model: null,
  part: null,
  ...extra,
});
const ROWS: CatalogRow[] = [
  row("s1", "Batería", "Baterías", "59.00", {
    quality: "compatible",
    model: { id: "m1", name: "Galaxy A54", brand: "Samsung" },
    estimatedTime: "1 h",
  }),
  row("s2", "Cambio de pantalla", "Pantallas", "129.00", {
    description: "Pantalla nueva y prueba de táctil",
    quality: "original",
    model: { id: "m2", name: "iPhone 12", brand: "Apple" },
  }),
  row("s3", "Revisión", "Diagnóstico", "20.00"),
  row("s4", "Cambio de pantalla", "Pantallas", "49.00", {
    available: false,
    model: { id: "m3", name: "iPhone 8", brand: "Apple" },
    quality: "compatible",
  }),
];
const DETAIL: ServiceData = {
  id: "s4",
  name: "Cambio de pantalla",
  description: "",
  category: "Pantallas",
  price: "49.00",
  estimatedTime: null,
  available: false,
  modelId: "m3",
  quality: "compatible",
  inventoryId: null,
};

beforeEach(() => {
  role = "SUPER_ADMIN";
  params = new URLSearchParams();
  replace.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/services/catalog") return json(ROWS);
    if (url === "/api/models") return json([{ id: "m3", name: "iPhone 8", brandId: "b1" }]);
    if (url === "/api/brands") return json([{ id: "b1", name: "Apple" }]);
    if (url === "/api/inventory") return json([]);
    if (url === "/api/services/s4") return init?.method === "PATCH" ? json({ id: "s4" }) : json(DETAIL);
    if (url === "/api/services" && init?.method === "POST") return json({ id: "s9" }, 201);
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("catalog logic", () => {
  it("finds services by any words of name, model or brand, ignoring accents", () => {
    const names = (q: string) => filterCatalog(ROWS, { q, category: null, hideUnavailable: false }).map((r) => r.id);
    expect(names("bateria a54")).toEqual(["s1"]);
    expect(names("APPLE pantalla")).toEqual(["s2", "s4"]);
    expect(names("tactil")).toEqual(["s2"]);
    expect(filterCatalog(ROWS, { q: "", category: "Pantallas", hideUnavailable: true }).map((r) => r.id)).toEqual(["s2"]);
    expect(categoryCounts(ROWS)).toEqual([
      ["Baterías", 1],
      ["Diagnóstico", 1],
      ["Pantallas", 2],
    ]);
    expect([modelLabel(ROWS[0]), modelLabel(ROWS[2])]).toEqual(["Galaxy A54 · Compatible", "Todos los modelos"]);
  });

  it("sends only what changed, and clears optional text as null", () => {
    const d = serviceDraftFrom(DETAIL);
    expect(serviceBody(d, DETAIL)).toEqual({});
    expect(serviceBody({ ...d, price: 45, category: " " }, DETAIL)).toEqual({ price: 45, category: null });
    expect(serviceBody({ ...d, available: true }, DETAIL)).toEqual({ available: true });
  });
});

describe("ServicesPage", () => {
  it("lists the catalog with withdrawn services marked, and filters in the address", async () => {
    render(<ServicesPage />);
    await act(async () => {});
    within(screen.getByRole("row", { name: /iPhone 8/ })).getByText("No disponible");
    within(screen.getByRole("row", { name: /Galaxy A54/ })).getByText("Galaxy A54 · Compatible");
    screen.getByText("4 servicios");
    fireEvent.click(screen.getByRole("button", { name: "Pantallas 2" }));
    expect(replace).toHaveBeenLastCalledWith("/servicios?categoria=Pantallas", { scroll: false });
    fireEvent.click(screen.getByRole("checkbox", { name: "Ocultar no disponibles" }));
    // The address is not re-read here, so each change starts from the first one.
    expect(replace).toHaveBeenLastCalledWith("/servicios?ocultar=1", { scroll: false });

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar servicio" }), { target: { value: "bateria" } });
    screen.getByText("1 servicio de 4");
  });

  it("keeps store accounts out", () => {
    role = "STORE_ADMIN";
    render(<ServicesPage />);
    screen.getByText("Sin permiso.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens a withdrawn service and changes its price without making it available", async () => {
    params = new URLSearchParams("servicio=s4");
    render(<ServicesPage />);
    await act(async () => {});
    const form = screen.getByRole("complementary", { name: "Editar servicio" });
    expect((within(form).getByRole("checkbox", { name: /Disponible/ }) as HTMLInputElement).checked).toBe(false);
    fireEvent.change(within(form).getByLabelText(/^Precio/), { target: { value: "45" } });
    await act(async () => {
      fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    });
    const [url, init] = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "PATCH") as [
      string,
      RequestInit,
    ];
    expect([url, JSON.parse(init.body as string)]).toEqual(["/api/services/s4", { price: 45 }]);
    expect(replace).toHaveBeenLastCalledWith("/servicios?servicio=s4", { scroll: false });
  });
});

describe("ServiceForm", () => {
  it("asks for name and price, then creates an available service with an empty description", async () => {
    const onSaved = vi.fn();
    render(<ServiceForm categories={["Pantallas"]} onSaved={onSaved} onCancel={() => {}} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Crear servicio" }));
    screen.getByText("Escribe el nombre del servicio.");
    screen.getByText("Escribe el precio, por ejemplo 59,00.");

    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Cambio de pantalla" } });
    fireEvent.change(screen.getByLabelText(/^Precio/), { target: { value: "129,00" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Modelo" }), { target: { value: "m3" } });
    fireEvent.click(screen.getByRole("radio", { name: "Original" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear servicio" }));
    });
    const [, init] = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === "POST") as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Cambio de pantalla",
      description: "",
      price: 129,
      available: true,
      modelId: "m3",
      quality: "original",
    });
    expect(onSaved).toHaveBeenCalledWith("s9");
    expect(screen.getByRole("combobox", { name: "Modelo" }).textContent).toContain("Apple iPhone 8");
  });
});
