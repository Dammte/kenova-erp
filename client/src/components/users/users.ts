/** Design 3.6 «Usuarios»: give access, take it away and unlock someone in under a minute. */
import type { Role } from "@/components/auth/AuthProvider";

/** GET /api/users: never any password material. */
export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  storeId: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  /** Locked out after too many failed logins. */
  locked: boolean;
}

/** GET /api/stores. */
export interface StoreOption {
  id: string;
  name: string;
  isActive: boolean;
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Socio",
  STORE_ADMIN: "Tienda",
};

/** «AR» from «Ana Rojo». */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** What the status column says, most urgent first. */
export function statusOf(u: Pick<UserRow, "isActive" | "locked" | "mustChangePassword">): {
  label: string;
  tone: "ok" | "warn" | "off";
  note?: string;
} {
  if (!u.isActive) return { label: "Desactivado", tone: "off" };
  if (u.locked) return { label: "Bloqueado", tone: "warn", note: "Restablece la contraseña para desbloquearlo" };
  if (u.mustChangePassword) return { label: "Activo", tone: "ok", note: "Debe cambiar contraseña" };
  return { label: "Activo", tone: "ok" };
}

const time = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const day = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

/** «Ahora», «Hoy 12:40», «Ayer 18:02», «02/08/2026» or «Nunca». */
export function lastAccess(iso: string | null, now = new Date()): string {
  if (!iso) return "Nunca";
  const at = new Date(iso);
  if (now.getTime() - at.getTime() < 5 * 60_000) return "Ahora";
  const today = day.format(now);
  const yesterday = day.format(new Date(now.getTime() - 86_400_000));
  const d = day.format(at);
  if (d === today) return `Hoy ${time.format(at)}`;
  if (d === yesterday) return `Ayer ${time.format(at)}`;
  return d;
}

/**
 * A temporary password the partner hands over in person: 3 groups of 4
 * letters and digits without look-alikes (0/O, 1/l/I), easy to read aloud.
 * 12 symbols of 54 is about 69 bits; the server asks for 12 characters.
 */
export function temporaryPassword(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  // Rejection sampling keeps every symbol equally likely.
  while (out.length < 12) {
    for (const b of random(16)) {
      if (b < 54 * 4 && out.length < 12) out.push(alphabet[b % 54]!);
    }
  }
  return [out.slice(0, 4), out.slice(4, 8), out.slice(8)].map((g) => g.join("")).join("-");
}

export interface NewUserDraft {
  fullName: string;
  username: string;
  email: string;
  role: Role;
  storeId: string;
}

export type NewUserErrors = Partial<Record<keyof NewUserDraft, string>>;

export function validateNewUser(d: NewUserDraft): NewUserErrors {
  const e: NewUserErrors = {};
  if (d.fullName.trim().length < 3) e.fullName = "Escribe el nombre, al menos 3 letras.";
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(d.username.trim()))
    e.username = "De 3 a 50 caracteres: letras sin tildes, números, punto, guion o guion bajo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = "Escribe un email válido.";
  if (d.role === "STORE_ADMIN" && !d.storeId) e.storeId = "Elige la tienda de esta cuenta.";
  return e;
}

/** «marta.ibanez» from «Marta Ibáñez». */
export function suggestUsername(fullName: string): string {
  return fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(".")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 50);
}
