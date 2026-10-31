/**
 * Design 2.5: the WhatsApp texts each store sends its clients. The base texts
 * live here; a store only gets a row once it changes one of them.
 */
export const TEMPLATE_TRIGGERS = [
  'received',
  'waiting_parts',
  'ready',
  'reminder_15',
  'reminder_30',
] as const;
export type TemplateTrigger = (typeof TEMPLATE_TRIGGERS)[number];

export const TEMPLATE_VARIABLES = [
  'nombre',
  'modelo',
  'orden',
  'total',
  'saldo',
  'tienda',
] as const;

/** Longest text accepted; the editor already warns past 1,000 characters. */
export const TEMPLATE_MAX_LENGTH = 2000;

export const BASE_TEMPLATES: Record<
  TemplateTrigger,
  { name: string; when: string; body: string }
> = {
  received: {
    name: 'Recibido',
    when: 'Al crear la orden',
    body: 'Hola {nombre}, hemos recibido tu {modelo}. Tu número de orden es {orden}. Te avisaremos cuando esté listo.\n{tienda}',
  },
  waiting_parts: {
    name: 'Pendiente de piezas',
    when: 'Al pasar a Pendiente de piezas',
    body: 'Hola {nombre}, para reparar tu {modelo} ({orden}) necesitamos una pieza que ya hemos pedido. Te avisamos en cuanto llegue.\n{tienda}',
  },
  ready: {
    name: 'Listo para recoger',
    when: 'Al pasar a Finalizado',
    body: 'Hola {nombre}, tu {modelo} ya está reparado y listo para recoger. Orden {orden}.[si saldo] Quedan {saldo} por pagar.[/si]\nTe esperamos en {tienda}.',
  },
  reminder_15: {
    name: 'Recordatorio 15 días',
    when: '15 días en Finalizado sin recoger',
    body: 'Hola {nombre}, te recordamos que tu {modelo} ({orden}) lleva 15 días listo para recoger en {tienda}.[si saldo] Quedan {saldo} por pagar.[/si]',
  },
  reminder_30: {
    name: 'Recordatorio 30 días',
    when: '30 días en Finalizado sin recoger',
    body: 'Hola {nombre}, tu {modelo} ({orden}) lleva 30 días en {tienda}. Pásate a recogerlo o llámanos para buscar una solución.',
  },
};

/** The variable people most likely meant when they typed an unknown one. */
const LIKELY: Record<string, string> = {
  precio: 'saldo',
  importe: 'saldo',
  pendiente: 'saldo',
  deuda: 'saldo',
  cliente: 'nombre',
  dispositivo: 'modelo',
  equipo: 'modelo',
  movil: 'modelo',
  numero: 'orden',
  codigo: 'orden',
  local: 'tienda',
};
const HINT: Record<string, string> = {
  saldo: 'para el importe pendiente',
  nombre: 'para el nombre del cliente',
  modelo: 'para el dispositivo',
  orden: 'para el número de orden',
  tienda: 'para el nombre de la tienda',
};

const known = (name: string) =>
  (TEMPLATE_VARIABLES as readonly string[]).includes(name);
const plain = (name: string) =>
  name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function unknownVariable(name: string): string {
  const guess = LIKELY[plain(name)];
  if (guess)
    return `La variable {${name}} no existe. Usa {${guess}} ${HINT[guess]}.`;
  return `La variable {${name}} no existe. Puedes usar ${TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(' ')}.`;
}

/** The first problem with a template's text, or null when it can be saved. */
export function templateProblem(body: string): string | null {
  if (!body.trim()) return 'Escribe el texto del aviso.';
  if (body.length > TEMPLATE_MAX_LENGTH) {
    return `El texto no puede pasar de ${TEMPLATE_MAX_LENGTH} caracteres.`;
  }
  for (const [, name] of body.matchAll(/\{([^{}]*)\}/g)) {
    if (!known(name)) return unknownVariable(name);
  }
  let open: string | null = null;
  for (const [tag, closing, name] of body.matchAll(
    /\[(\/?)si(?:\s+([^\]]*))?\]/g,
  )) {
    if (closing) {
      if (!open) return 'Hay un [/si] sin su [si …] de apertura.';
      open = null;
      continue;
    }
    if (open)
      return `Cierra el bloque [si ${open}] con [/si] antes de abrir otro.`;
    const variable = (name ?? '').trim();
    if (!known(variable)) {
      return variable
        ? `El bloque ${tag} usa una variable que no existe. ${unknownVariable(variable)}`
        : 'Indica la variable del bloque, por ejemplo [si saldo].';
    }
    open = variable;
  }
  if (open) return `Falta cerrar el bloque [si ${open}] con [/si].`;
  return null;
}
