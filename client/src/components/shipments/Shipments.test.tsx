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
import { ShipmentsPage } from "./ShipmentsPage";
import {
  canReceive,
  lineState,
  listUrl,
  readQuery,
  shipmentSummary,
  type Shipment,
} from "./shipments";

const replace = vi.fn();
let search = "";
let user: SessionUser;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/envios",
  useSearchParams: () => new URLSearchParams(search),
}));
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
const VILLARCAYO = { id: "s2", name: "Villarcayo" };
const MEDINA = { id: "s1", name: "Medina de Pomar" };

const SENT: Shipment = {
  id: "e14",
  code: "ENV-0014",
  status: "sent",
  fromStore: VILLARCAYO,
  toStore: MEDINA,
  carrier: "Transportes Merindades",
  createdBy: { id: "u2", fullName: "Marta I." },
  createdAt: "2026-10-30T09:00:00Z",
  receivedAt: null,
  deviceCount: 2,
  lines: [
    {
      orderId: "o36",
      orderCode: "VC-0036",
      clientName: "Iker Bárcena",
      device: "Apple iPhone 13",
      accessories: "funda",
      reportedFaults: ["broken_screen"],
      faultNotes: null,
      receivedAt: null,
      notArrived: false,
    },
    {
      orderId: "o39",
      orderCode: "VC-0039",
      clientName: "Elena Saiz",
      device: "Samsung Galaxy S23",
      accessories: null,
      reportedFaults: [],
      faultNotes: null,
      receivedAt: null,
      notArrived: false,
    },
  ],
};
const INCOMPLETE: Shipment = {
  ...SENT,
  id: "e12",
  code: "ENV-0012",
  status: "received_incomplete",
  receivedAt: "2026-10-27T12:00:00Z",
  deviceCount: 3,
  lines: undefined,
};

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** Answers each API call by its address; scans answer with what the test queues. */
let scans: Response[] = [];
function api() {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/shipments?") || url === "/api/shipments") {
      return json({ items: [SENT, INCOMPLETE], total: 2 });
    }
    if (url.endsWith("/scan")) return scans.shift() ?? json({}, 500);
    if (url.endsWith("/close") && init?.method === "POST") {
      return json({ ...SENT, status: "received_incomplete" });
    }
    if (url === "/api/shipments/e14") return json(SENT);
    return json({ message: "Envío no encontrado" }, 404);
  });
}

beforeEach(() => {
  search = "";
  user = SUPER;
  scans = [];
  replace.mockReset();
  fetchMock.mockReset();
  api();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function show() {
  render(<ShipmentsPage />);
  await act(async () => {});
}

const calls = () => fetchMock.mock.calls.map((c) => c[0] as string);

async function scan(code: string, answer: Response) {
  scans.push(answer);
  const field = screen.getByPlaceholderText("Escanea la etiqueta…");
  fireEvent.change(field, { target: { value: code } });
  fireEvent.submit(field);
  await act(async () => {});
}

describe("ShipmentsPage", () => {
  it("lists the shipments with route, status and devices, and opens one", async () => {
    await show();
    const list = screen.getByRole("region", { name: "Envíos" });
    const first = within(list).getByRole("button", { name: /ENV-0014/ });
    expect(first.textContent).toContain("Villarcayo → Medina de Pomar");
    expect(first.textContent).toContain("Salió el 30/10/2026 · 2 equipos");
    within(list).getByText("Recibido incompleto el 27/10/2026 · 3 equipos");
    fireEvent.click(first);
    expect(replace).toHaveBeenCalledWith("/envios?envio=e14", {
      scroll: false,
    });
  });

  it("opens the form for a new shipment, named for who sends", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "+ Envío a tienda" }));
    expect(replace).toHaveBeenCalledWith("/envios?envio=nuevo", {
      scroll: false,
    });
    cleanup();
    user = { ...SUPER, role: "STORE_ADMIN", storeId: VILLARCAYO.id };
    search = "envio=nuevo";
    await show();
    screen.getByRole("button", { name: "+ Nuevo envío" });
    screen.getByRole("region", { name: "Nuevo envío" });
    expect(calls()).not.toContain("/api/shipments/nuevo");
  });

  it("the open shipment links to its printable sheet", async () => {
    search = "envio=e14";
    await show();
    expect(
      screen
        .getByRole("link", { name: "Imprimir hoja de envío" })
        .getAttribute("href"),
    ).toBe("/envios/e14/hoja");
  });

  it("filters by status from page 1, keeping it in the address", async () => {
    search = "estado=sent&page=2";
    await show();
    expect(calls()[0]).toBe("/api/shipments?page=2&status=sent");
    expect(
      screen
        .getByRole("button", { name: "Enviado" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    expect(replace).toHaveBeenCalledWith("/envios", { scroll: false });
  });

  it("an empty filter says so", async () => {
    search = "estado=received";
    fetchMock.mockResolvedValueOnce(json({ items: [], total: 0 }));
    await show();
    screen.getByText("No hay envíos en «Recibido».");
  });

  it("shows the open shipment's devices and where each one is", async () => {
    search = "envio=e14";
    await show();
    const card = screen.getByRole("region", { name: "Envío ENV-0014" });
    const rows = within(card).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(
      within(rows[0])
        .getByRole("link", { name: "VC-0036" })
        .getAttribute("href"),
    ).toBe("/ordenes?orden=o36");
    within(rows[0]).getByText("funda");
    within(rows[0]).getByText("En camino");
    within(card).getByText(
      /Transporta: Transportes Merindades · Creado por Marta I\./,
    );
  });

  it("a store cannot receive what goes to Medina, and is told who does", async () => {
    search = "envio=e14";
    user = { ...SUPER, role: "STORE_ADMIN", storeId: VILLARCAYO.id };
    await show();
    screen.getByText("Este envío lo recibe Medina de Pomar.");
    expect(
      screen.queryByRole("button", { name: "Recibir equipos" }),
    ).toBeNull();
  });

  it("receives with the scanner: confirms, warns without blocking, and counts", async () => {
    search = "envio=e14";
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Recibir equipos" }));
    const field = screen.getByPlaceholderText("Escanea la etiqueta…");
    expect(document.activeElement).toBe(field);
    screen.getByRole("heading", { name: "Recibir ENV-0014 · 0 de 2" });

    await scan(
      "vc-0036",
      json({
        result: "received",
        message: "VC-0036 recibido",
        orderCode: "VC-0036",
        received: 1,
        total: 2,
      }),
    );
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("/api/shipments/e14/scan");
    expect(init.body).toBe(JSON.stringify({ code: "VC-0036" }));
    screen.getByRole("heading", { name: "Recibir ENV-0014 · 1 de 2" });
    screen.getByText("VC-0036 recibido");
    expect((field as HTMLInputElement).value).toBe("");

    await scan(
      "VC-0040",
      json({
        result: "foreign",
        message:
          "VC-0040 no está en este envío. Es de Villarcayo y está En tienda (recepción).",
        orderCode: "VC-0040",
        received: 1,
        total: 2,
      }),
    );
    screen.getByText(
      "VC-0040 no está en este envío. Es de Villarcayo y está En tienda (recepción).",
    );
    screen.getByRole("heading", { name: "Recibir ENV-0014 · 1 de 2" });
  });

  it("a reading that fails asks to scan it again and keeps the confirmed ones", async () => {
    search = "envio=e14";
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Recibir equipos" }));
    await scan(
      "VC-0036",
      json({
        result: "received",
        message: "VC-0036 recibido",
        orderCode: "VC-0036",
        received: 1,
        total: 2,
      }),
    );
    await scan("VC-0039", new Response("", { status: 502 }));
    screen.getByText(
      "No se ha podido guardar la lectura de VC-0039. Vuelve a escanearla.",
    );
    screen.getByRole("heading", { name: "Recibir ENV-0014 · 1 de 2" });
  });

  it("ending with devices missing names them: keep waiting or mark them as not arrived", async () => {
    search = "envio=e14";
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Recibir equipos" }));
    await scan(
      "VC-0036",
      json({
        result: "received",
        message: "VC-0036 recibido",
        orderCode: "VC-0036",
        received: 1,
        total: 2,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Terminar recepción" }));
    const ask = screen.getByRole("alertdialog");
    within(ask).getByText("Falta VC-0039.");
    expect(calls().some((u) => u.endsWith("/close"))).toBe(false);

    fireEvent.click(
      within(ask).getByRole("button", { name: "Seguir esperando" }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Terminar recepción" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar como no llegado" }),
    );
    await act(async () => {});
    expect(calls()).toContain("/api/shipments/e14/close");
    // Back to the shipment, and the list reloads.
    expect(screen.queryByPlaceholderText("Escanea la etiqueta…")).toBeNull();
    expect(
      calls().filter(
        (u) => u.startsWith("/api/shipments?") || u === "/api/shipments",
      ),
    ).toHaveLength(2);
  });
});

describe("shipments", () => {
  it("reads the address and ignores what it does not know", () => {
    expect(readQuery(new URLSearchParams("estado=nope&page=-1"))).toEqual({
      status: null,
      page: 1,
    });
    const q = readQuery(
      new URLSearchParams("estado=received_incomplete&page=3"),
    );
    expect(listUrl(q)).toBe("/api/shipments?page=3&status=received_incomplete");
    expect(listUrl({ status: null, page: 1 })).toBe("/api/shipments");
  });

  it("says where each device is", () => {
    const line = SENT.lines![0];
    expect(lineState(line).label).toBe("En camino");
    expect(lineState({ ...line, notArrived: true }).label).toBe("No llegó");
    expect(
      lineState({ ...line, receivedAt: "2026-10-30T15:00:00Z" }).label,
    ).toBe("Recibido 30/10");
  });

  it("only the destination store or a partner receives, and only while it travels", () => {
    expect(canReceive(SENT, SUPER)).toBe(true);
    expect(canReceive(SENT, { role: "STORE_ADMIN", storeId: "s2" })).toBe(
      false,
    );
    expect(
      canReceive(
        { ...SENT, toStore: VILLARCAYO },
        { role: "STORE_ADMIN", storeId: "s2" },
      ),
    ).toBe(true);
    expect(canReceive(INCOMPLETE, SUPER)).toBe(false);
  });

  it("summarises one device in the singular", () => {
    expect(shipmentSummary({ ...SENT, deviceCount: 1 })).toBe(
      "Salió el 30/10/2026 · 1 equipo",
    );
  });
});
