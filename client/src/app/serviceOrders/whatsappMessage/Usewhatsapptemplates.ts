import { useState, useCallback } from "react";

export enum ServiceStatus {
  PENDIENTE_CLIENTE = "pendiente_cliente",
  EN_PROGRESO = "en_progreso",
  PENDIENTE_PIEZAS = "pendiente_piezas",
  FINALIZADO = "finalizado",
  ENTREGADO = "entregado",
  CANCELADO = "cancelado",
}

export interface TemplateVariables {
  nombre: string;
  dispositivo: string;
  orden: string;
  fecha_entrega?: string;
  precio?: string;
  saldo?: string;
  garantia?: string;
  tipo_reparacion?: string;
}

export type TemplatesMap = Record<ServiceStatus, string>;

const STORAGE_KEY = "whatsapp_templates_v2";

export const STATUS_LABELS: Record<ServiceStatus, string> = {
  [ServiceStatus.PENDIENTE_CLIENTE]: "Pendiente Cliente",
  [ServiceStatus.EN_PROGRESO]: "En Progreso",
  [ServiceStatus.PENDIENTE_PIEZAS]: "Esperando Repuestos",
  [ServiceStatus.FINALIZADO]: "Listo para Entregar",
  [ServiceStatus.ENTREGADO]: "Entregado",
  [ServiceStatus.CANCELADO]: "Cancelado",
};

export const STATUS_EMOJIS: Record<ServiceStatus, string> = {
  [ServiceStatus.PENDIENTE_CLIENTE]: "🔍",
  [ServiceStatus.EN_PROGRESO]: "🔧",
  [ServiceStatus.PENDIENTE_PIEZAS]: "⏳",
  [ServiceStatus.FINALIZADO]: "✅",
  [ServiceStatus.ENTREGADO]: "🎉",
  [ServiceStatus.CANCELADO]: "❌",
};

export const STATUS_DESCRIPTIONS: Record<ServiceStatus, string> = {
  [ServiceStatus.PENDIENTE_CLIENTE]:
    "Se envía cuando se está esperando respuesta o aprobación del cliente",
  [ServiceStatus.EN_PROGRESO]:
    "Se envía cuando el técnico ya comenzó a trabajar en el equipo",
  [ServiceStatus.PENDIENTE_PIEZAS]:
    "Se envía cuando hay que esperar la llegada de repuestos",
  [ServiceStatus.FINALIZADO]:
    "Se envía cuando el equipo está reparado y listo para recoger",
  [ServiceStatus.ENTREGADO]:
    "Se envía como seguimiento después de entregar el equipo",
  [ServiceStatus.CANCELADO]:
    "Se envía cuando la orden es cancelada por cualquier motivo",
};

export const DEFAULT_TEMPLATES: TemplatesMap = {
  [ServiceStatus.PENDIENTE_CLIENTE]:
    "¡Hola {nombre}! 👋 Necesitamos tu confirmación para continuar con el servicio de tu *{dispositivo}* (Orden #{orden}). Por favor contáctanos para coordinar. ¡Gracias!",
  [ServiceStatus.EN_PROGRESO]:
    "¡Hola {nombre}! 🔧 Buenas noticias, ya estamos trabajando en tu *{dispositivo}* (Orden #{orden}). Te notificaremos en cuanto esté listo. ¡Gracias por tu paciencia!",
  [ServiceStatus.PENDIENTE_PIEZAS]:
    "¡Hola {nombre}! ⏳ Tu *{dispositivo}* (Orden #{orden}) está en espera de repuestos. En cuanto lleguen retomamos el trabajo y te avisamos. ¡Gracias por esperar!",
  [ServiceStatus.FINALIZADO]:
    "¡Hola {nombre}! ✅ Tu *{dispositivo}* está listo para recoger (Orden #{orden}).{saldo} Puedes pasar cuando gustes. ¡Te esperamos!",
  [ServiceStatus.ENTREGADO]:
    "¡Hola {nombre}! 🎉 Esperamos que tu *{dispositivo}* esté funcionando de maravilla.{garantia} Si tienes cualquier duda escríbenos. ¡Gracias por confiar en nosotros!",
  [ServiceStatus.CANCELADO]:
    "¡Hola {nombre}! Te informamos que la orden #{orden} de tu *{dispositivo}* ha sido cancelada. Si tienes alguna pregunta estamos a tu disposición. ¡Hasta pronto!",
};

// Exported so the modal can use it directly without re-implementing
export const interpolate = (
  template: string,
  vars: TemplateVariables,
): string =>
  template
    .replace(/\{nombre\}/g, vars.nombre)
    .replace(/\{dispositivo\}/g, vars.dispositivo)
    .replace(/\{orden\}/g, vars.orden)
    .replace(/\{fecha_entrega\}/g, vars.fecha_entrega ?? "")
    .replace(/\{precio\}/g, vars.precio ?? "")
    .replace(
      /\{saldo\}/g,
      vars.saldo ? ` El saldo pendiente es *${vars.saldo}*.` : "",
    )
    .replace(
      /\{garantia\}/g,
      vars.garantia
        ? ` Recuerda que tienes *${vars.garantia}* de garantía.`
        : "",
    )
    .replace(/\{tipo_reparacion\}/g, vars.tipo_reparacion ?? "");

const loadTemplates = (): TemplatesMap => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_TEMPLATES };
    const parsed = JSON.parse(stored) as Partial<TemplatesMap>;
    return Object.values(ServiceStatus).reduce((acc, status) => {
      acc[status] = parsed[status] ?? DEFAULT_TEMPLATES[status];
      return acc;
    }, {} as TemplatesMap);
  } catch {
    return { ...DEFAULT_TEMPLATES };
  }
};

export const useWhatsAppTemplates = () => {
  const [templates, setTemplates] = useState<TemplatesMap>(loadTemplates);

  const persist = (updated: TemplatesMap) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      console.error("Error saving templates");
    }
  };

  const updateTemplate = useCallback((status: ServiceStatus, content: string) => {
    setTemplates((prev) => {
      const updated = { ...prev, [status]: content };
      persist(updated);
      return updated;
    });
  }, []);

  const resetTemplate = useCallback((status: ServiceStatus) => {
    setTemplates((prev) => {
      const updated = { ...prev, [status]: DEFAULT_TEMPLATES[status] };
      persist(updated);
      return updated;
    });
  }, []);

  const resetAllTemplates = useCallback(() => {
    const fresh = { ...DEFAULT_TEMPLATES };
    persist(fresh);
    setTemplates(fresh);
  }, []);

  const generateMessage = useCallback(
    (status: ServiceStatus, vars: TemplateVariables): string =>
      interpolate(templates[status] ?? DEFAULT_TEMPLATES[status], vars),
    [templates],
  );

  return {
    templates,
    updateTemplate,
    resetTemplate,
    resetAllTemplates,
    generateMessage,
    STATUS_LABELS,
    STATUS_EMOJIS,
  };
};