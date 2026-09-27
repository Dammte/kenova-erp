"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Save, X, ArrowLeft, Camera, AlertCircle } from "lucide-react";
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
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export default function EditPart() {
  const router = useRouter();
  const { id } = useParams();
  const [formData, setFormData] = useState<PartForm>({} as PartForm);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [formError, setFormError] = useState("");


  useEffect(() => {
    const fetchPartData = async () => {
      try {
        const response = await apiFetch(`${API_URL}/inventory/${id}`);
        if (!response.ok) throw new Error("Error cargando repuesto");
        const data = await response.json();
        setFormData(data);
        setImagePreview(data.imagePath || null);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Error cargando repuesto");
      } finally {
        setIsLoading(false);
      }
    };
    fetchPartData();
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;

    if (["stock", "minimalStock", "salesPrice", "costPrice"].includes(name)) {
      // Allow clearing the field: treat empty as 0
      const numValue = value === "" ? 0 : parseFloat(value);
      if (!isNaN(numValue)) {
        setErrors((prev) => { const e = { ...prev }; delete e[name]; return e; });
        setFormData((prev) => ({ ...prev, [name]: numValue }));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
      if (value.trim() && errors[name]) {
        setErrors((prev) => { const e = { ...prev }; delete e[name]; return e; });
      }
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) {
        setErrors((prev) => ({ ...prev, image: "Formato de imagen inválido" }));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);

      setFormData((prev) => ({
        ...prev,
        imagePath: URL.createObjectURL(file),
      }));
    }
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, imagePath: "" }));
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    // Use explicit checks so 0 is valid for numeric fields
    if (!formData.name?.trim()) newErrors.name = "Campo requerido";
    if (!formData.category) newErrors.category = "Campo requerido";
    if (formData.stock < 0) newErrors.stock = "El stock no puede ser negativo";
    if (formData.minimalStock < 0) newErrors.minimalStock = "El stock mínimo no puede ser negativo";
    if (formData.salesPrice < 0) newErrors.salesPrice = "El precio no puede ser negativo";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const response = await apiFetch(`${API_URL}/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error actualizando repuesto");
      }

      showToast.success("Repuesto actualizado con éxito", {
        duration: 3000,
        position: "top-right",
      });
      router.push(`/inventory/${id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setFormError(msg);
    }
  };

  const generateSku = () => {
    if (formData.brand && formData.category) {
      const brandPrefix = formData.brand.slice(0, 3).toUpperCase();
      const categoryPrefix = formData.category.slice(0, 3).toUpperCase();
      const randomNum = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0");
      setFormData((prev) => ({
        ...prev,
        sku: `${brandPrefix}-${categoryPrefix}-${randomNum}`,
      }));
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando datos del repuesto...</p>
      </div>
    );
  }

  if (formError) {
    return (
      <div className={styles.errorContainer}>
        <AlertCircle size={24} />
        <p>{formError}</p>
        <button onClick={() => router.push("/inventory")}>
          Volver al inventario
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href={`/inventory/${id}`} className={styles.backButton}>
          <ArrowLeft size={18} />
          <span>Volver al detalle</span>
        </Link>
        <h1 className={styles.title}>Editar Repuesto</h1>
      </div>

      {formError && (
        <div className={styles.errorMessage}>
          <AlertCircle size={18} />
          <p>{formError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formGrid}>
          <div className={styles.leftColumn}>
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
                />
                {errors.name && (
                  <span className={styles.errorText}>{errors.name}</span>
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
                    <span className={styles.errorText}>{errors.category}</span>
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
                  />
                </div>
              </div>
            </div>

            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Inventario</h2>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="stock">
                    Stock actual *
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
                    <span className={styles.errorText}>{errors.stock}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="minimalStock">
                    Stock mínimo *
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
                    <span className={styles.errorText}>
                      {errors.minimalStock}
                    </span>
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
                      step="0.01"
                      className={`${styles.input} ${
                        errors.salesPrice ? styles.inputError : ""
                      }`}
                    />
                  </div>
                  {errors.salesPrice && (
                    <span className={styles.errorText}>
                      {errors.salesPrice}
                    </span>
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
                      step="0.01"
                      className={styles.input}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.rightColumn}>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Imagen del repuesto</h2>
              <div className={styles.imageUpload}>
                {imagePreview ? (
                  <div className={styles.imagePreviewContainer}>
                    <img
                      src={imagePreview}
                      alt="Vista previa"
                      className={styles.imagePreview}
                    />
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
                      onChange={handleImageChange}
                      accept="image/*"
                      className={styles.fileInput}
                    />
                    <label htmlFor="image" className={styles.uploadLabel}>
                      <div className={styles.uploadIcon}>
                        <Camera size={24} />
                      </div>
                      <div className={styles.uploadText}>
                        <p>Subir nueva imagen</p>
                        <span>PNG, JPG (máx. 5MB)</span>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            </div>

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
                />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            onClick={() => router.push(`/inventory/${id}`)}
            className={styles.cancelButton}
          >
            Cancelar
          </button>
          <button type="submit" className={styles.submitButton}>
            <Save size={18} />
            Guardar Cambios
          </button>
        </div>
      </form>
    </div>
  );
}
