/**
 * Design 2.5: notice texts with {variables} and [si variable]…[/si] blocks.
 * The rules match the server's (message-templates/templates.ts), so the editor
 * says what is wrong before saving.
 */
export const TEMPLATE_TRIGGERS = ["received", "waiting_parts", "ready", "reminder_15", "reminder_30"] as const;
export type TemplateTrigger = (typeof TEMPLATE_TRIGGERS)[number];

export const TEMPLATE_VARIABLES = ["nombre", "modelo", "orden", "total", "saldo", "tienda"] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateValues = Record<TemplateVariable, string>;

export const TEMPLATE_MAX_LENGTH = 2000;
/** Past this the editor warns: WhatsApp reads better short. */
export const TEMPLATE_LONG = 1000;

export interface MessageTemplate {
  trigger: TemplateTrigger;
  name: string;
  when: string;
  body: string;
  isBase: boolean;
  updatedAt: string | null;
  updatedBy: { fullName: string } | null;
}

export const SAMPLE_ORDER = "MP-0142";
export const sampleValues = (tienda: string): TemplateValues => ({
  nombre: "Lucía",
  modelo: "iPhone 13",
  orden: SAMPLE_ORDER,
  total: "149,00 €",
  saldo: "90,00 €",
  tienda,
});

const LIKELY: Record<string, TemplateVariable> = {
  precio: "saldo",
  importe: "saldo",
  pendiente: "saldo",
  deuda: "saldo",
  cliente: "nombre",
  dispositivo: "modelo",
  equipo: "modelo",
  movil: "modelo",
  numero: "orden",
  codigo: "orden",
  local: "tienda",
};
const HINT: Partial<Record<TemplateVariable, string>> = {
  saldo: "para el importe pendiente",
  nombre: "para el nombre del cliente",
  modelo: "para el dispositivo",
  orden: "para el número de orden",
  tienda: "para el nombre de la tienda",
};

const known = (name: string): name is TemplateVariable => (TEMPLATE_VARIABLES as readonly string[]).includes(name);
const plain = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

function unknownVariable(name: string): string {
  const guess = LIKELY[plain(name)];
  if (guess) return `La variable {${name}} no existe. Usa {${guess}} ${HINT[guess]}.`;
  return `La variable {${name}} no existe. Puedes usar ${TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(" ")}.`;
}

const BLOCK = /\[(\/?)si(?:\s+([^\]]*))?\]/g;

/** The first problem with a text, or null when it can be saved. */
export function templateProblem(body: string): string | null {
  if (!body.trim()) return "Escribe el texto del aviso.";
  if (body.length > TEMPLATE_MAX_LENGTH) return `El texto no puede pasar de ${TEMPLATE_MAX_LENGTH} caracteres.`;
  for (const [, name] of body.matchAll(/\{([^{}]*)\}/g)) {
    if (!known(name)) return unknownVariable(name);
  }
  let open: string | null = null;
  for (const [tag, closing, name] of body.matchAll(BLOCK)) {
    if (closing) {
      if (!open) return "Hay un [/si] sin su [si …] de apertura.";
      open = null;
      continue;
    }
    if (open) return `Cierra el bloque [si ${open}] con [/si] antes de abrir otro.`;
    const variable = (name ?? "").trim();
    if (!known(variable)) {
      return variable
        ? `El bloque ${tag} usa una variable que no existe. ${unknownVariable(variable)}`
        : "Indica la variable del bloque, por ejemplo [si saldo].";
    }
    open = variable;
  }
  if (open) return `Falta cerrar el bloque [si ${open}] con [/si].`;
  return null;
}

/** Empty, or an amount of zero ("0,00 €"): a [si …] block on it is left out. */
const isBlank = (value: string) => !value.trim() || /^[0.,\s €]+$/.test(value);

/** The text with its values in. Call it only on a text without problems. */
export function renderTemplate(body: string, values: TemplateValues): string {
  const withBlocks = body.replace(/\[si\s+([^\]]*)\]([\s\S]*?)\[\/si\]/g, (_, name: string, inner: string) => {
    const v = name.trim();
    return known(v) && !isBlank(values[v]) ? inner : "";
  });
  return withBlocks.replace(/\{([^{}]*)\}/g, (match, name: string) => (known(name) ? values[name] : match));
}

/** What to look at before saving: things that may read wrong, not errors. */
export function templateWarnings(body: string, tienda: string): string[] {
  const out: string[] = [];
  const paid = renderTemplate(body, { ...sampleValues(tienda), saldo: "0,00 €" });
  if (paid.length > TEMPLATE_LONG) out.push("Mensaje largo; en WhatsApp se lee mejor si es corto.");
  if (/(^|[^\d])0,00\s?€/.test(paid)) {
    out.push("Si la orden está pagada dirá «0,00 €». Pon {saldo} dentro de [si saldo]…[/si].");
  }
  return out;
}
