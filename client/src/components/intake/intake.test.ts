import { describe, expect, it } from "vitest";
import { EMPTY_DEVICE, intakePayload, missing, newClientFrom, toggleWord, type IntakeState } from "./intake";
import { withClient } from "./IntakeForm";

const BASE: IntakeState = {
  client: null,
  device: null,
  faults: [],
  faultNotes: "",
  physicalCondition: "",
  accessories: "",
  priority: "medium",
  observations: "",
};
const LUCIA = { id: "c1", firstName: "Lucía", lastName: "Fernández", phoneNumber: "612345678" };
const IPHONE = { id: "d1", type: "movil", brand: "Apple", model: "iPhone 13", imei: null, createdAt: "2026-10-01T10:00:00Z" };

describe("newClientFrom", () => {
  it("sends digits to the phone and the rest to the name", () => {
    expect(newClientFrom("lucía 612 345 678")).toMatchObject({ firstName: "Lucía", phoneNumber: "612 345 678" });
  });
  it("sends an @ to the email", () => {
    expect(newClientFrom(" lucia@correo.es ")).toMatchObject({ email: "lucia@correo.es", firstName: "" });
  });
});

describe("toggleWord", () => {
  it("adds and removes a chip word in a comma list", () => {
    expect(toggleWord("", "Funda")).toBe("Funda");
    expect(toggleWord("Funda", "Cargador")).toBe("Funda, Cargador");
    expect(toggleWord("Funda, Cargador", "Funda")).toBe("Cargador");
  });
});

describe("missing", () => {
  it("lists everything on an empty intake", () => {
    expect(missing(BASE).map((m) => m.text)).toEqual(["Cliente", "Dispositivo", "Avería declarada"]);
  });
  it("checks the new client's name, phone and the new device's brand and model", () => {
    const s = { ...BASE, client: newClientFrom("61234"), device: EMPTY_DEVICE, faults: ["battery"] };
    expect(missing(s).map((m) => m.field)).toEqual(["client-name", "client-phone", "device-brand", "device-model"]);
  });
  it("is empty with a known client, device and a fault", () => {
    expect(missing({ ...BASE, client: LUCIA, device: IPHONE, faults: ["battery"] })).toEqual([]);
  });
});

describe("withClient", () => {
  it("opens the device form for a new client and keeps it while typing", () => {
    const s = withClient(BASE, newClientFrom("Ana"));
    expect(s.device).toEqual(EMPTY_DEVICE);
    const typed = { ...s, device: { ...EMPTY_DEVICE, brand: "Samsung" } };
    expect(withClient(typed, newClientFrom("Ana 6")).device).toMatchObject({ brand: "Samsung" });
  });
  it("drops the device when the client changes", () => {
    expect(withClient({ ...BASE, client: LUCIA, device: IPHONE }, { ...LUCIA, id: "c2" }).device).toBeNull();
    expect(withClient({ ...BASE, client: LUCIA, device: IPHONE }, null).device).toBeNull();
  });
});

describe("intakePayload", () => {
  it("references a known client and device", () => {
    const p = intakePayload({ ...BASE, client: LUCIA, device: IPHONE, faults: ["other", "battery"], faultNotes: " " });
    expect(p).toEqual({
      clientId: "c1",
      deviceId: "d1",
      order: {
        status: "en_progreso",
        priority: "medium",
        reportedFaults: ["battery", "other"],
        faultNotes: null,
        physicalCondition: null,
        accessories: null,
      },
    });
  });
  it("sends a new client and device, cleaning the IMEI and skipping an empty code", () => {
    const p = intakePayload({
      ...BASE,
      client: { firstName: " Ana ", lastName: "", phoneNumber: "612345678", email: "" },
      device: { type: "tablet", brand: "Apple", model: "iPad", imei: "35 6789-10", code: " " },
      faults: ["battery"],
      accessories: "Funda",
      observations: "Urge",
    });
    expect(p).toMatchObject({ client: { firstName: "Ana", lastName: null, phoneNumber: "612345678", email: null } });
    expect("device" in p && p.device).toEqual({ type: "tablet", brand: "Apple", model: "iPad", imei: "35678910" });
    expect(p.order).toMatchObject({ accessories: "Funda", observations: "Urge" });
  });
});
