"use client";

import { useState } from "react";
import { Button, TextField } from "@/components/ui";

/** Same minimum as the server (MIN_PASSWORD_LENGTH). */
export const MIN_PASSWORD_LENGTH = 12;

/** What still stops the new password from being saved, said plainly. */
export function newPasswordProblem(password: string, repeat: string): string | undefined {
  if (!password) return "Escribe la contraseña nueva.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    const missing = MIN_PASSWORD_LENGTH - password.length;
    const count = missing === 1 ? "Falta 1 carácter" : `Faltan ${missing} caracteres`;
    return `${count}: el mínimo es ${MIN_PASSWORD_LENGTH}.`;
  }
  if (!repeat) return "Repite la contraseña nueva.";
  if (repeat !== password) return "Las dos contraseñas no coinciden.";
  return undefined;
}

interface Props {
  password: string;
  repeat: string;
  onPassword: (value: string) => void;
  onRepeat: (value: string) => void;
}

/** Design 3.7: the new password twice, one "Mostrar" for both. */
export function NewPasswordFields({ password, repeat, onPassword, onRepeat }: Props) {
  const [show, setShow] = useState(false);
  // Flag a mismatch as soon as the repeat stops being a prefix of the password.
  const mismatch = repeat.length > 0 && !password.startsWith(repeat);
  return (
    <>
      <TextField
        label="Contraseña nueva"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={password}
        onChange={(e) => onPassword(e.target.value)}
        hint={`Al menos ${MIN_PASSWORD_LENGTH} caracteres. Una frase corta es más fácil de recordar.`}
        suffix={
          <Button variant="ghost" size="sm" aria-pressed={show} onClick={() => setShow((v) => !v)}>
            {show ? "Ocultar" : "Mostrar"}
          </Button>
        }
      />
      <TextField
        label="Repite la contraseña"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => onRepeat(e.target.value)}
        error={mismatch ? "No coinciden. Vuelve a escribirla." : undefined}
      />
    </>
  );
}
