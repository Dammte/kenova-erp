"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, AlertCircle, X } from "lucide-react";
import styles from "./page.module.css";

interface FormData {
  name: string;
  description: string;
  price: string;
  estimatedTime: string;
  category: string;
  available: boolean;
}

const NewService = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    name: "",
    description: "",
    price: "",
    estimatedTime: "",
    category: "",
    available: true,
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]:
        name === "available" ? (e.target as HTMLInputElement).checked : value,
    });
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      available: e.target.checked,
    });
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError("El nombre del servicio es obligatorio.");
      return false;
    }

    if (!formData.description.trim()) {
      setError("La descripción del servicio es obligatoria.");
      return false;
    }

    if (!formData.price.trim() || isNaN(parseFloat(formData.price))) {
      setError("El precio debe ser un valor numérico válido.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch(`${API_URL}/services`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          price: parseFloat(formData.price),
          estimatedTime: formData.estimatedTime || undefined,
          category: formData.category || undefined,
          available: formData.available,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al crear el servicio");
      }

      setSuccess(true);
      setFormData({
        name: "",
        description: "",
        price: "",
        estimatedTime: "",
        category: "",
        available: true,
      });

      setTimeout(() => {
        router.push("/services");
      }, 2000);
    } catch (err) {
      console.error("Error creating service:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Error al crear el servicio. Inténtalo de nuevo."
      );
    } finally {
      setLoading(false);
    }
  };

  const dismissError = () => {
    setError(null);
  };

  const categoryOptions = [
    "Seleccionar categoría",
    "Reparación de pantalla",
    "Reparación de batería",
    "Recuperación de datos",
    "Reparación de placa base",
    "Limpieza y mantenimiento",
    "Actualización de software",
    "Cambio de componentes",
    "Diagnóstico",
    "Otro",
  ];

  return (
    <div className={styles["new-service-container"]}>
      <div className={styles["page-header"]}>
        <Link href="/services" className={styles["back-button"]}>
          <ArrowLeft size={18} />
          <span>Volver</span>
        </Link>
        <h1 className={styles["page-title"]}>Crear Nuevo Servicio</h1>
      </div>

      {error && (
        <div className={styles["error-notification"]}>
          <div className={styles["error-content"]}>
            <AlertCircle className={styles["error-icon"]} />
            <p>{error}</p>
          </div>
          <button className={styles["dismiss-button"]} onClick={dismissError}>
            <X size={18} />
          </button>
        </div>
      )}

      {success && (
        <div className={styles["success-notification"]}>
          <div className={styles["success-content"]}>
            <p>¡Servicio creado exitosamente! Redireccionando...</p>
          </div>
        </div>
      )}

      <div className={styles["form-container"]}>
        <form onSubmit={handleSubmit} className={styles["service-form"]}>
          <div className={styles["form-grid"]}>
            <div className={styles["form-group"]}>
              <label htmlFor="name" className={styles["form-label"]}>
                Nombre del servicio{" "}
                <span className={styles["required"]}>*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={styles["form-input"]}
                placeholder="Ej. Reparación de pantalla iPhone"
                disabled={loading}
                required
              />
            </div>

            <div className={styles["form-group"]}>
              <label htmlFor="price" className={styles["form-label"]}>
                Precio <span className={styles["required"]}>*</span>
              </label>
              <input
                type="text"
                id="price"
                name="price"
                value={formData.price}
                onChange={handleChange}
                className={styles["form-input"]}
                placeholder="Ej. 100.00"
                pattern="^\d+(\.\d{1,2})?$"
                disabled={loading}
                required
              />
            </div>

            <div className={styles["form-group"]}>
              <label htmlFor="category" className={styles["form-label"]}>
                Categoría
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className={styles["form-select"]}
                disabled={loading}
              >
                {categoryOptions.map((option, index) => (
                  <option
                    key={index}
                    value={index === 0 ? "" : option}
                    disabled={index === 0}
                  >
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles["form-group"]}>
              <label htmlFor="estimatedTime" className={styles["form-label"]}>
                Tiempo estimado
              </label>
              <input
                type="text"
                id="estimatedTime"
                name="estimatedTime"
                value={formData.estimatedTime}
                onChange={handleChange}
                className={styles["form-input"]}
                placeholder="Ej. 2-3 horas"
                disabled={loading}
              />
            </div>

            <div className={`${styles["form-group"]} ${styles["full-width"]}`}>
              <label htmlFor="description" className={styles["form-label"]}>
                Descripción <span className={styles["required"]}>*</span>
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                className={styles["form-textarea"]}
                placeholder="Describa detalladamente el servicio que ofrece..."
                rows={5}
                disabled={loading}
                required
              />
            </div>

            <div
              className={`${styles["form-group"]} ${styles["checkbox-group"]}`}
            >
              <div className={styles["checkbox-container"]}>
                <input
                  type="checkbox"
                  id="available"
                  name="available"
                  checked={formData.available}
                  onChange={handleCheckboxChange}
                  className={styles["form-checkbox"]}
                  disabled={loading}
                />
                <label htmlFor="available" className={styles["checkbox-label"]}>
                  Disponible para clientes
                </label>
              </div>
              <p className={styles["help-text"]}>
                Marque esta opción para que el servicio sea visible para los
                clientes
              </p>
            </div>
          </div>

          <div className={styles["form-actions"]}>
            <Link
              href="/services"
              className={styles["cancel-button"]}
              tabIndex={0}
            >
              Cancelar
            </Link>
            <button
              type="submit"
              className={styles["submit-button"]}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2
                    className={`${styles["button-icon"]} ${styles["loading-spinner"]}`}
                    size={18}
                  />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className={styles["button-icon"]} size={18} />
                  <span>Guardar Servicio</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewService;
