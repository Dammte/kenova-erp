"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, ChangeEvent, FormEvent } from "react";
import styles from "./page.module.css";
import { showToast } from "nextjs-toast-notify";

const ContactMethod = {
  PHONE: "PHONE",
  EMAIL: "EMAIL",
  SMS: "SMS",
} as const;

type ContactMethod = typeof ContactMethod[keyof typeof ContactMethod];

const DniType = {
  NIF: "NIF",
  NIE: "NIE",
  PASSPORT: "Pasaporte",
} as const;

type DniType = typeof DniType[keyof typeof DniType];

interface NewClientFormData {
  dniType: DniType;
  dni: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  preferredContact: ContactMethod;
  observations?: string;
}

export default function NewClientForm() {
  const [form, setForm] = useState<NewClientFormData>({
    dniType: DniType.NIF,
    dni: "",
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    address: "",
    postalCode: "",
    city: "",
    preferredContact: ContactMethod.PHONE,
    observations: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch(`${API_URL}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Error creando cliente");

      setForm({
        dniType: DniType.NIF,
        dni: "",
        firstName: "",
        lastName: "",
        email: "",
        phoneNumber: "",
        address: "",
        postalCode: "",
        city: "",
        preferredContact: ContactMethod.PHONE,
        observations: "",
      });

      showToast.success("Cliente creado con éxito", {
        position: "top-right",
        duration: 3000,
        progress: true,
        transition: "fadeIn",
        icon: "✅",
      });
    } catch{
      showToast.error("Error desconocido", {
        position: "top-right",
        duration: 3000,
        progress: true,
        transition: "fadeIn",
        icon: "❌",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className={styles.formContainer} onSubmit={handleSubmit} noValidate>
      <div className={styles.formHeader}>
        <h2 className={styles.formTitle}>Nuevo Cliente</h2>
        <p className={styles.formSubtitle}>
          Complete todos los campos requeridos
        </p>
      </div>

      <div className={styles.formGrid}>
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Tipo de documento</label>
          <select
            className={styles.selectInput}
            name="dniType"
            value={form.dniType}
            onChange={handleChange}
          >
            {Object.values(DniType).map((dt) => (
              <option key={dt} value={dt}>
                {dt}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Número de documento</label>
          <input
            type="text"
            className={styles.textInput}
            name="dni"
            value={form.dni}
            onChange={handleChange}
            placeholder="Ej: X1234567Z"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Nombre</label>
          <input
            type="text"
            className={styles.textInput}
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            required
            placeholder="Juan"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Apellidos</label>
          <input
            type="text"
            className={styles.textInput}
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            required
            placeholder="Pérez García"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Correo electrónico</label>
          <input
            type="email"
            className={styles.textInput}
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="juan.perez@ejemplo.com"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Telefono</label>
          <input
            type="tel"
            className={styles.textInput}
            name="phoneNumber"
            value={form.phoneNumber}
            onChange={handleChange}
            placeholder="+34 600 123 456"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Dirección</label>
          <input
            type="text"
            className={styles.textInput}
            name="address"
            value={form.address}
            onChange={handleChange}
            placeholder="Calle Principal 123"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Código Postal</label>
          <input
            type="text"
            className={styles.textInput}
            name="postalCode"
            value={form.postalCode}
            onChange={handleChange}
            placeholder="28001"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Ciudad</label>
          <input
            type="text"
            className={styles.textInput}
            name="city"
            value={form.city}
            onChange={handleChange}
            placeholder="Madrid"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>
            Método de contacto preferido
          </label>
          <select
            className={styles.selectInput}
            name="preferredContact"
            value={form.preferredContact}
            onChange={handleChange}
          >
            {Object.values(ContactMethod).map((cm) => (
              <option key={cm} value={cm}>
                {cm}
              </option>
            ))}
          </select>
        </div>

        <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
          <label className={styles.inputLabel}>Observaciones</label>
          <textarea
            className={styles.textareaInput}
            name="observations"
            rows={4}
            value={form.observations}
            onChange={handleChange}
            placeholder="Notas adicionales..."
          />
        </div>
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      <button type="submit" className={styles.submitButton} disabled={loading}>
        {loading ? <div className={styles.spinner} /> : "Crear Cliente"}
      </button>
    </form>
  );
}
