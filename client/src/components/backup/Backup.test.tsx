import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { SessionUser } from "@/components/auth/AuthProvider";
import { BackupPage } from "./BackupPage";
import {
  backupFileName,
  cell,
  daysSince,
  isStale,
  sheetRows,
  type BackupExport,
} from "./backup";

let user: SessionUser;
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user }),
}));
const writeFile = vi.fn();
vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: (rows: unknown[][]) => ({ rows }),
    book_new: () => ({ sheets: [] as unknown[] }),
    book_append_sheet: (
      book: { sheets: unknown[] },
      sheet: unknown,
      name: string,
    ) => book.sheets.push({ sheet, name }),
  },
  writeFile: (...args: unknown[]) => writeFile(...args),
}));

const SUPER: SessionUser = {
  id: "u1",
  email: "ana@kenova.es",
  fullName: "Ana Rojo",
  role: "SUPER_ADMIN",
  storeId: null,
  mustChangePassword: false,
};
const EXPORT: BackupExport = {
  exportedAt: "2026-11-01T23:30:00Z",
  tables: [
    {
      name: "service_orders",
      columns: ["code", "reportedFaults", "total"],
      rows: [{ code: "MP-0001", reportedFaults: ["battery"], total: "59.00" }],
    },
    {
      name: "client",
      columns: ["firstName", "phoneNumber"],
      rows: [{ firstName: "Iker", phoneNumber: null }],
    },
  ],
};

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
let last: { lastExportAt: string | null; by: string | null };

beforeEach(() => {
  user = SUPER;
  last = { lastExportAt: null, by: null };
  writeFile.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/backup/export" && init?.method === "POST") {
      last = { lastExportAt: EXPORT.exportedAt, by: "Ana Rojo" };
      return json(EXPORT);
    }
    return json(last);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function show() {
  render(<BackupPage />);
  await act(async () => {});
}

describe("BackupPage", () => {
  it("warns when no copy was ever made", async () => {
    await show();
    screen.getByText("Aún no se ha hecho ninguna copia.");
    expect(
      screen.getByRole("region", { name: "Última copia" }).className,
    ).toMatch(/stale/);
  });

  it("exports every table to one Excel, a sheet per table, then shows the new date", async () => {
    await show();
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar todos los datos" }),
    );
    await act(async () => {});
    await act(async () => {});
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [book, name] = writeFile.mock.calls[0];
    expect(name).toBe("Kenova_copia_2026-11-02.xlsx");
    expect(book.sheets.map((s: { name: string }) => s.name)).toEqual([
      "service_orders",
      "client",
    ]);
    expect(screen.getByRole("status").textContent).toBe(
      "Descargado Kenova_copia_2026-11-02.xlsx: 2 tablas y 2 registros. Guárdalo fuera de este ordenador.",
    );
    expect(
      screen.getByRole("region", { name: "Última copia" }).textContent,
    ).toMatch(/por Ana Rojo/);
  });

  it("says when the export fails and keeps the button", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? json({ message: "Algo falló" }, 500)
        : json(last),
    );
    await show();
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar todos los datos" }),
    );
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toBe("Algo falló");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("a store is told the copy belongs to the partners", async () => {
    user = { ...SUPER, role: "STORE_ADMIN", storeId: "s2" };
    await show();
    screen.getByText(/la hacen los socios/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("backup", () => {
  it("turns database values into cells", () => {
    expect(sheetRows(EXPORT.tables[0])).toEqual([
      ["code", "reportedFaults", "total"],
      ["MP-0001", '["battery"]', "59.00"],
    ]);
    expect(cell(undefined)).toBeNull();
    expect(cell(3)).toBe(3);
    expect(cell({ a: 1 })).toBe('{"a":1}');
    expect(cell("x".repeat(40000))).toHaveLength(32767);
  });

  it("knows when the last copy is too old", () => {
    const now = Date.parse("2026-11-10T12:00:00Z");
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("2026-11-03T12:00:00Z", now)).toBe(7);
    expect(
      isStale({ lastExportAt: "2026-11-03T12:00:00Z", by: null }, now),
    ).toBe(false);
    expect(
      isStale({ lastExportAt: "2026-11-02T11:00:00Z", by: null }, now),
    ).toBe(true);
    expect(isStale({ lastExportAt: null, by: null }, now)).toBe(true);
    expect(backupFileName("2026-10-31T23:30:00Z")).toBe(
      "Kenova_copia_2026-11-01.xlsx",
    );
  });
});

describe("BackupReminder", () => {
  it("words the warning for a missing or an old copy", async () => {
    const { reminderText } = await import("./BackupReminder");
    const now = Date.parse("2026-11-10T12:00:00Z");
    expect(reminderText({ lastExportAt: null, by: null }, now)).toBe(
      "Aún no se ha hecho ninguna copia de seguridad de los datos.",
    );
    expect(
      reminderText({ lastExportAt: "2026-11-01T12:00:00Z", by: null }, now),
    ).toBe(
      "Hace 9 días que no se hace una copia de seguridad (se recomienda cada 7).",
    );
  });
});
