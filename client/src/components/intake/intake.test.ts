import { describe, expect, it } from "vitest";
import { EMPTY_DEVICE, fromQuote, intakePayload, missing, newClientFrom, orderTotal, toggleWord, type IntakeState } from "./intake";
import { matchServices } from "./ServicePicker";
import { dashDots } from "./DevicePicker";
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
  services: [],
  total: null,
  deposit: null,
  method: null,
  waivesQuote: false,
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
  it("sends a new client and device, cleaning the IMEI and leaving out an unused secret", () => {
    const p = intakePayload({
      ...BASE,
      client: { firstName: " Ana ", lastName: "", phoneNumber: "612345678", email: "" },
      device: { type: "tablet", brand: "Apple", model: "iPad", imei: "35 6789-10", unlock: "none", code: "1234", pattern: "" },
      faults: ["battery"],
      accessories: "Funda",
      observations: "Urge",
    });
    expect(p).toMatchObject({ client: { firstName: "Ana", lastName: null, phoneNumber: "612345678", email: null } });
    expect("device" in p && p.device).toEqual({ type: "tablet", brand: "Apple", model: "iPad", imei: "35678910" });
    expect(p.order).toMatchObject({ accessories: "Funda", observations: "Urge" });
  });
});

describe("money", () => {
  const PANTALLA = { id: "s2", name: "Cambio de pantalla", price: "149.00" };
  const FUNDA = { id: "s4", name: "Funda", price: "9.90" };
  const READY = { ...BASE, client: LUCIA, device: IPHONE, faults: ["broken_screen"] };

  it("sums the services unless a total was agreed", () => {
    expect(orderTotal({ services: [PANTALLA, FUNDA], total: null })).toBe(158.9);
    expect(orderTotal({ services: [PANTALLA, FUNDA], total: 150 })).toBe(150);
  });
  it("refuses a deposit above the total and one without a payment method", () => {
    expect(missing({ ...READY, services: [PANTALLA], deposit: 200, method: "cash" }).map((m) => m.field)).toEqual(["deposit"]);
    expect(missing({ ...READY, services: [PANTALLA], deposit: 50, method: null }).map((m) => m.field)).toEqual(["method"]);
  });
  it("sends services, total and deposit only when there are any", () => {
    expect(intakePayload(READY).order).not.toHaveProperty("totalPrice");
    expect(intakePayload(READY).order).not.toHaveProperty("waivesQuote");
    expect(intakePayload({ ...READY, waivesQuote: true }).order).toMatchObject({ waivesQuote: true });
    expect(intakePayload({ ...READY, services: [PANTALLA], total: 140, deposit: 40, method: "cash" }).order).toMatchObject({
      serviceIds: ["s2"],
      totalPrice: 140,
      amountPaid: 40,
      paymentMethod: "cash",
    });
  });
});

describe("matchServices", () => {
  const ALL = [
    { id: "a", name: "Cambio de pantalla Galaxy A54", price: 119 },
    { id: "b", name: "Cambio de pantalla iPhone 13", price: 149 },
    { id: "c", name: "Batería iPhone 13", price: 69 },
  ];
  it("puts the device model's services first and skips chosen ones", () => {
    expect(matchServices(ALL, "pantalla", "iPhone 13", []).map((x) => x.id)).toEqual(["b", "a"]);
    expect(matchServices(ALL, "", "iphone 13", ["b"]).map((x) => x.id)).toEqual(["c"]);
    expect(matchServices(ALL, "bateria", "", []).map((x) => x.id)).toEqual(["c"]);
  });
});

describe("unlock", () => {
  const NEW = { ...EMPTY_DEVICE, brand: "Samsung", model: "A54" };
  const READY = { ...BASE, client: LUCIA, faults: ["battery"] };

  it("asks for the chosen secret only", () => {
    expect(missing({ ...READY, device: NEW })).toEqual([]);
    expect(missing({ ...READY, device: { ...NEW, unlock: "code" } }).map((m) => m.field)).toEqual(["device-code"]);
    expect(missing({ ...READY, device: { ...NEW, unlock: "pattern", pattern: "1-2-3" } }).map((m) => m.field)).toEqual([
      "device-pattern",
    ]);
    expect(missing({ ...READY, device: { ...NEW, unlock: "pattern", pattern: "1-2-3-6" } })).toEqual([]);
  });
  it("sends the pattern and not a code left from switching", () => {
    const p = intakePayload({ ...READY, device: { ...NEW, unlock: "pattern", code: "1234", pattern: "1-5-9-6" } });
    expect("device" in p && p.device).toMatchObject({ pattern: "1-5-9-6" });
    expect("device" in p && p.device).not.toHaveProperty("code");
  });
  it("turns typed dots into the stored format", () => {
    expect(dashDots("1596")).toBe("1-5-9-6");
    expect(dashDots("1 5-0 9")).toBe("1-5-9");
  });
});

describe("fromQuote", () => {
  const QUOTE = {
    id: "q1",
    code: "MP-P0031",
    clientName: "Aitor Etxeberria Uriarte",
    clientPhone: "688 450 117",
    brand: "Apple",
    model: "MacBook Air M1",
    fault: "Daño por líquido",
    total: "435.00",
    lines: [
      { serviceId: "s1", description: "Placa base", unitPrice: "380.00" },
      { serviceId: null, description: "Limpieza", unitPrice: "35.00" },
      { serviceId: "s1", description: "Placa base", unitPrice: "380.00" },
    ],
  };
  const EMPTY = {
    client: null,
    device: null,
    faults: [],
    faultNotes: "",
    physicalCondition: "",
    accessories: "",
    priority: "medium" as const,
    observations: "",
    services: [],
    total: null,
    deposit: null,
    method: null,
    waivesQuote: false,
  };

  it("fills client, device, rates and the quoted total, and sends the quote id", () => {
    const s = fromQuote(EMPTY, QUOTE, null);
    expect(s.client).toEqual({ firstName: "Aitor", lastName: "Etxeberria Uriarte", phoneNumber: "688 450 117", email: "" });
    expect(s.device).toMatchObject({ brand: "Apple", model: "MacBook Air M1", unlock: "none" });
    expect(s.services).toEqual([{ id: "s1", name: "Placa base", price: "380.00" }]);
    expect(s.total).toBe(435);
    expect(s.faultNotes).toBe("Daño por líquido");
    const done = { ...s, faults: ["liquid_damage"] };
    expect(intakePayload(done)).toMatchObject({ quoteId: "q1", order: { serviceIds: ["s1"], totalPrice: 435 } });
  });

  it("reuses the client found with the same phone", () => {
    const known = { id: "c1", firstName: "Aitor", lastName: "Etxeberria", phoneNumber: "688450117" };
    expect(fromQuote(EMPTY, QUOTE, known).client).toBe(known);
  });
});
