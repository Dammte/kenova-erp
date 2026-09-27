"use client";

import { API_URL, apiFetch } from "@/lib/api";
import { useState } from "react";
import { X, ArrowLeft, Camera, AlertCircle } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";
import { showToast } from "nextjs-toast-notify";

const AVAILABLE_CATEGORIES = [
  "Pantallas",
  "Baterías",
  "Conectores",
  "Audio",
  "Cámaras",
  "Botones",
  "Placas base",
  "Sensores",
  "Accesorios",
  "Otros",
];

const COMMON_BRANDS = [
  "Apple",
  "Samsung",
  "Xiaomi",
  "Huawei",
  "Motorola",
  "OnePlus",
  "Google",
  "Oppo",
  "Sony",
  "LG",
  "Nokia",
  "Otra",
];

interface PartForm {
  name: string;
  description: string;
  category: string;
  brand: string;
  model: string;
  sku: string;
  stock: number;
  minimalStock: number;
  salesPrice: number;
  costPrice: number;
  ubication: string;
  provider: string;
  imagePath: string;
}

export default function AddPart() {
  const [formData, setFormData] = useState<PartForm>({
    name: "",
    description: "",
    category: "",
    brand: "",
    model: "",
    sku: "",
    stock: 0,
    minimalStock: 0,
    salesPrice: 0,
    costPrice: 0,
    ubication: "",
    provider: "",
    imagePath: "",
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [showSuccess, setShowSuccess] = useState(false);

  const requiredFields = ["name", "category"];

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;

    if (["stock", "minimalStock", "salesPrice", "costPrice"].includes(name)) {
      // Allow clearing: treat empty as 0
      const numValue = value === "" ? 0 : parseFloat(value);
      if (!isNaN(numValue)) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
        setFormData((prev) => ({ ...prev, [name]: numValue }));
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));

      if (value.trim() !== "" && errors[name]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[name];
          return newErrors;
        });
      }
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      if (!file.type.includes("image/")) {
        setErrors((prev) => ({
          ...prev,
          image: "Por favor selecciona un archivo de imagen válido",
        }));
        return;
      }

      setFormData((prev) => ({
        ...prev,
        imagePath: "",
      }));

      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.imagePath;
        return newErrors;
      });
    }
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({
      ...prev,
      imagePath: "",
    }));
    setImagePreview(null);
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    requiredFields.forEach((field) => {
      if (!formData[field as keyof PartForm]) {
        newErrors[field] = "Este campo es obligatorio";
      }
    });

    if (formData.stock < 0) {
      newErrors.stock = "El stock inicial no puede ser negativo";
    }

    if (formData.minimalStock < 0) {
      newErrors.minimalStock = "El stock mínimo no puede ser negativo";
    }

    if (formData.salesPrice < 0) {
      newErrors.salesPrice = "El precio no puede ser negativo";
    }

    if (formData.costPrice < 0) {
      newErrors.costPrice = "El precio de costo no puede ser negativo";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      try {
        const formDataToSend = await apiFetch(`${API_URL}/inventory`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...formData,
            createdBy: "admin",
            updatedBy: "admin",
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        });

        if (!formDataToSend.ok) {
          throw new Error("Error al enviar el formulario");
        }

        showToast.success("Repuesto agregado con éxito", {
          duration: 3000,
          position: "top-right",
        });

        setShowSuccess(true);

        setTimeout(() => {
          setFormData({
            name: "",
            description: "",
            category: "",
            brand: "",
            model: "",
            sku: "",
            stock: 0,
            minimalStock: 0,
            salesPrice: 0,
            costPrice: 0,
            ubication: "",
            provider: "",
            imagePath: "",
          });
          setImagePreview(null);
          setShowSuccess(false);
        }, 2000);
      } catch (error) {
        console.error("Error submitting form:", error);
        showToast.error(
          "Ocurrió un error al guardar el repuesto. Por favor intenta de nuevo.",
          {
            duration: 5000,
            position: "top-right",
          }
        );
        setErrors((prev) => ({
          ...prev,
          form: "Ocurrió un error al guardar el repuesto. Por favor intenta de nuevo.",
        }));
      }
    } else {
      const firstErrorField = Object.keys(errors)[0];
      const element = document.querySelector(`[name="${firstErrorField}"]`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const generateSku = () => {
    if (formData.brand && formData.category) {
      const brandPrefix = formData.brand.substring(0, 3).toUpperCase();
      const categoryPrefix = formData.category.substring(0, 3).toUpperCase();
      const randomNum = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0");

      setFormData((prev) => ({
        ...prev,
        sku: `${brandPrefix}-${categoryPrefix}-${randomNum}`,
      }));
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/inventory">
          <span className={styles.backButton}>
            <ArrowLeft size={18} />
            <span>Volver al Inventario</span>
          </span>
        </Link>
        <h1 className={styles.title}>Agregar Nuevo Repuesto</h1>
      </div>

      {showSuccess && (
        <div className={styles.successMessage}>
          <div className={styles.successIcon}>✓</div>
          <p>¡Repuesto agregado con éxito!</p>
        </div>
      )}

      {errors.form && (
        <div className={styles.errorMessage}>
          <AlertCircle size={18} />
          <p>{errors.form}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGrid}>
          {/* Columna izquierda */}
          <div className={styles.leftColumn}>
            {/* Información básica */}
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Información básica</h2>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="name">
                  Nombre del repuesto *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`${styles.input} ${
                    errors.name ? styles.inputError : ""
                  }`}
                  placeholder="Ej. Pantalla LCD iPhone 12"
                />
                {errors.name && (
                  <p className={styles.errorText}>{errors.name}</p>
                )}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="description">
                  Descripción
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  className={styles.textarea}
                  placeholder="Describe el repuesto, características, color, etc."
                  rows={3}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="category">
                    Categoría *
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className={`${styles.select} ${
                      errors.category ? styles.inputError : ""
                    }`}
                  >
                    <option value="">Seleccionar categoría</option>
                    {AVAILABLE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className={styles.errorText}>{errors.category}</p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="brand">
                    Marca
                  </label>
                  <select
                    id="brand"
                    name="brand"
                    value={formData.brand}
                    onChange={handleChange}
                    className={styles.select}
                  >
                    <option value="">Seleccionar marca</option>
                    {COMMON_BRANDS.map((brand) => (
                      <option key={brand} value={brand}>
                        {brand}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="model">
                    Modelo
                  </label>
                  <input
                    type="text"
                    id="model"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    className={styles.input}
                    placeholder="Ej. iPhone 12 Pro Max"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="sku">
                    SKU/Código
                    <button
                      type="button"
                      onClick={generateSku}
                      className={styles.generateButton}
                    >
                      Generar
                    </button>
                  </label>
                  <input
                    type="text"
                    id="sku"
                    name="sku"
                    value={formData.sku}
                    onChange={handleChange}
                    className={styles.input}
                    placeholder="Ej. PANT-IPH-0001"
                  />
                </div>
              </div>
            </div>

            {/* Sección de Inventario */}
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Inventario</h2>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="stock">
                    Stock inicial
                  </label>
                  <input
                    type="number"
                    id="stock"
                    name="stock"
                    value={formData.stock}
                    onChange={handleChange}
                    min="0"
                    className={`${styles.input} ${
                      errors.stock ? styles.inputError : ""
                    }`}
                  />
                  {errors.stock && (
                    <p className={styles.errorText}>{errors.stock}</p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="minimalStock">
                    Stock mínimo
                  </label>
                  <input
                    type="number"
                    id="minimalStock"
                    name="minimalStock"
                    value={formData.minimalStock}
                    onChange={handleChange}
                    min="0"
                    className={`${styles.input} ${
                      errors.minimalStock ? styles.inputError : ""
                    }`}
                  />
                  {errors.minimalStock && (
                    <p className={styles.errorText}>{errors.minimalStock}</p>
                  )}
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="salesPrice">
                    Precio de venta *
                  </label>
                  <div className={styles.priceInput}>
                    <span className={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      id="salesPrice"
                      name="salesPrice"
                      value={formData.salesPrice}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className={`${styles.input} ${
                        errors.salesPrice ? styles.inputError : ""
                      }`}
                    />
                  </div>
                  {errors.salesPrice && (
                    <p className={styles.errorText}>{errors.salesPrice}</p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="costPrice">
                    Precio de costo
                  </label>
                  <div className={styles.priceInput}>
                    <span className={styles.currencySymbol}>$</span>
                    <input
                      type="number"
                      id="costPrice"
                      name="costPrice"
                      value={formData.costPrice}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className={styles.input}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Columna derecha */}
          <div className={styles.rightColumn}>
            {/* Sección de imagen */}
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Imagen del repuesto</h2>

              <div className={styles.imageUpload}>
                {imagePreview ? (
                  <div className={styles.imagePreviewContainer}>
                    <Link
                      href={imagePreview}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.imagePreview}
                    ></Link>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className={styles.removeImageButton}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <div className={styles.imageUploadPlaceholder}>
                    <input
                      type="file"
                      id="image"
                      name="image"
                      value={formData.imagePath}
                      onChange={handleImageChange}
                      accept="image/*"
                      className={styles.fileInput}
                    />
                    <label htmlFor="image" className={styles.uploadLabel}>
                      <div className={styles.uploadIcon}>
                        <Camera size={24} />
                      </div>
                      <div className={styles.uploadText}>
                        <p>Subir imagen</p>
                        <span>PNG, JPG (máx. 5MB)</span>
                      </div>
                    </label>
                  </div>
                )}
                {errors.imagePath && (
                  <p className={styles.errorText}>{errors.imagePath}</p>
                )}
              </div>
            </div>

            {/* Información adicional */}
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Información adicional</h2>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="ubication">
                  Ubicación en almacén
                </label>
                <input
                  type="text"
                  id="ubication"
                  name="ubication"
                  value={formData.ubication}
                  onChange={handleChange}
                  className={styles.input}
                  placeholder="Ej. Estante A, Caja 3"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="provider">
                  Proveedor
                </label>
                <input
                  type="text"
                  id="provider"
                  name="provider"
                  value={formData.provider}
                  onChange={handleChange}
                  className={styles.input}
                  placeholder="Nombre del proveedor"
                />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.formActions}>
          <Link href="/inventory">
            
            <span className={styles.cancelButton}> Cancelar</span>
          </Link>
          <button type="submit" className={styles.submitButton}>
            Guardar Repuesto
          </button>
        </div>
      </form>
    </div>
  );
}
