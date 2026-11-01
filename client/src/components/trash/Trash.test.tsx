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
import { TrashPage } from "./TrashPage";
import { deletedLine, listUrl, openHref, type TrashItem } from "./trash";

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
const ORDER: TrashItem = {
  kind: "order",
  id: "o22",
  title: "VC-0022",
  detail: "Lucía Gómez · Apple iPhone 13",
  deletedAt: "2026-10-30T10:00:00Z",
  deletedBy: "Ana Rojo",
};
const PART: TrashItem = {
  kind: "part",
  id: "p1",
  title: "Batería iPhone 13",
  detail: "BAT-IP13",
  deletedAt: "2026-10-29T10:00:00Z",
  deletedBy: null,
};

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
let restoreAnswer: () => Response;

beforeEach(() => {
  user = SUPER;
  restoreAnswer = () => new Response(null, { status: 204 });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? restoreAnswer()
      : json({ items: [ORDER, PART], total: 2 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function show() {
  render(<TrashPage />);
  await act(async () => {});
}
const lists = () =>
  fetchMock.mock.calls
    .filter((c) => !(c[1] as RequestInit | undefined)?.method)
    .map((c) => c[0] as string);

describe("TrashPage", () => {
  it("lists what was deleted, when and by whom", async () => {
    await show();
    expect(lists()).toEqual(["/api/trash"]);
    const items = screen.getAllByRole("listitem");
    within(items[0]).getByText("VC-0022");
    within(items[0]).getByText("Eliminado el 30/10/2026 por Ana Rojo");
    within(items[1]).getByText("Repuesto");
    within(items[1]).getByText("Eliminado el 29/10/2026");
  });

  it("filters by kind from page 1", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Repuestos" }));
    await act(async () => {});
    expect(lists().at(-1)).toBe("/api/trash?kind=part");
    expect(
      screen
        .getByRole("button", { name: "Repuestos" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("restores an item, says where it went and reloads", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar VC-0022" }));
    await act(async () => {});
    const post = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(post?.[0]).toBe("/api/trash/order/o22/restore");
    screen.getByText("VC-0022 vuelve a Órdenes.");
    expect(
      screen.getByRole("link", { name: "Abrir" }).getAttribute("href"),
    ).toBe("/ordenes?orden=o22");
    expect(lists()).toHaveLength(2);
  });

  it("says why a restore failed", async () => {
    restoreAnswer = () => json({ message: "No está en la papelera" }, 404);
    await show();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar VC-0022" }));
    await act(async () => {});
    screen.getByRole("alert");
    screen.getByText("No está en la papelera");
  });

  it("an empty bin says so", async () => {
    fetchMock.mockImplementation(async () => json({ items: [], total: 0 }));
    await show();
    screen.getByText("La papelera está vacía.");
  });

  it("a store is told the section belongs to the partners", async () => {
    user = { ...SUPER, role: "STORE_ADMIN", storeId: "s2" };
    await show();
    screen.getByText(/la gestionan los socios/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("trash", () => {
  it("builds the list address and where each item opens", () => {
    expect(listUrl(null, "  ", 1)).toBe("/api/trash");
    expect(listUrl("client", " lucía ", 2)).toBe(
      "/api/trash?kind=client&q=luc%C3%ADa&page=2",
    );
    expect(openHref({ kind: "client", id: "c1" })).toBe("/clientes?cliente=c1");
    expect(openHref({ kind: "part", id: "p1" })).toBe(
      "/inventario?repuesto=p1",
    );
    expect(deletedLine({ ...PART, deletedAt: "2026-10-31T23:30:00Z" })).toBe(
      "Eliminado el 01/11/2026",
    );
  });
});
