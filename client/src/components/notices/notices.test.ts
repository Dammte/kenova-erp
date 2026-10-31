import { describe, expect, it } from "vitest";
import { renderTemplate, sampleValues, templateProblem, templateWarnings } from "./notices";

const READY =
  "Hola {nombre}, tu {modelo} ya está listo. Orden {orden}.[si saldo] Quedan {saldo} por pagar.[/si]\nTe esperamos en {tienda}.";

describe("notice templates", () => {
  it("fills the values and leaves out a [si saldo] block when nothing is owed", () => {
    const values = sampleValues("Kenova Medina");
    expect(renderTemplate(READY, values)).toBe(
      "Hola Lucía, tu iPhone 13 ya está listo. Orden MP-0142. Quedan 90,00 € por pagar.\nTe esperamos en Kenova Medina.",
    );
    expect(renderTemplate(READY, { ...values, saldo: "0,00 €" })).toBe(
      "Hola Lucía, tu iPhone 13 ya está listo. Orden MP-0142.\nTe esperamos en Kenova Medina.",
    );
  });

  it("explains an unknown variable or a broken block, like the server", () => {
    expect(templateProblem("Te quedan {precio}")).toBe(
      "La variable {precio} no existe. Usa {saldo} para el importe pendiente.",
    );
    expect(templateProblem("[si saldo] debes")).toBe("Falta cerrar el bloque [si saldo] con [/si].");
    expect(templateProblem(READY)).toBeNull();
  });

  it("warns about «0,00 €» and long texts", () => {
    expect(templateWarnings("Debes {saldo}", "K")).toEqual([
      "Si la orden está pagada dirá «0,00 €». Pon {saldo} dentro de [si saldo]…[/si].",
    ]);
    expect(templateWarnings(READY, "K")).toEqual([]);
    expect(templateWarnings("a".repeat(1001), "K")).toEqual(["Mensaje largo; en WhatsApp se lee mejor si es corto."]);
  });
});
