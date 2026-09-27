"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, useEffect, ChangeEvent, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./page.module.css";

const ContactMethod = {
  PHONE: "Teléfono",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
};

const DniType = {
  NIF: "NIF",
  NIE: "NIE",
  PASSPORT: "Pasaporte",
};

interface ClientFormData {
  dniType: string;
  dni: string;
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  preferredContact: string;
  observations?: string;
}

export default function EditClientForm() {
  const router = useRouter();
  const { id } = useParams();
  const [form, setForm] = useState<ClientFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const response = await apiFetch(`${API_URL}/clients/${id}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setForm({
          ...data,
          dniType: data.dniType || DniType.NIF,
          preferredContact: data.preferredContact || ContactMethod.PHONE,
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchClient();
  }, [id]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`${API_URL}/clients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error actualizando cliente");
      }

      router.push(`/clients/${id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !form) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando datos del cliente...</p>
      </div>
    );
  }

  return (
    <form className={styles.formContainer} onSubmit={handleSubmit} noValidate>
      <div className={styles.formHeader}>
        <h2 className={styles.formTitle}>Editar Cliente</h2>
        <p className={styles.formSubtitle}>ID: {id}</p>
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
            value={form.email || ""}
            onChange={handleChange}
            placeholder="juan.perez@ejemplo.com"
          />
        </div>

        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Teléfono</label>
          <input
            type="tel"
            className={styles.textInput}
            name="phoneNumber"
            value={form.phoneNumber || ""}
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
            value={form.address || ""}
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
            value={form.postalCode || ""}
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
            value={form.city || ""}
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
            required
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
            value={form.observations || ""}
            onChange={handleChange}
            rows={4}
            placeholder="Notas adicionales..."
          />
        </div>
      </div>

      {error && <div className={styles.errorMessage}>{error}</div>}

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className={styles.submitButton}
          disabled={loading}
        >
          {loading ? <div className={styles.spinner} /> : "Guardar Cambios"}
        </button>
      </div>
    </form>
  );
}
