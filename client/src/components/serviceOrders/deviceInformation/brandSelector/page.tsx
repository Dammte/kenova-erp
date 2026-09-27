"use client";

import { API_URL, apiFetch } from "@/lib/api";

import React, { useState, useEffect } from "react";
import BackButtonHeader from "../backButtonHeader/page";
import {
  Smartphone,
  Tablet,
  Laptop,
  Plus,
  Search,
  X,
  Check,
  Loader2,
  CircleEllipsis,
} from "lucide-react";
import styles from "./page.module.css";
import { showToast } from "nextjs-toast-notify";

type TipoDispositivo = "movil" | "tablet" | "computador" | "otro";

interface Brand {
  id: string;
  name: string;
}

interface BrandSelectorProps {
  tipoDispositivo: TipoDispositivo;
  onSelect: (brand: Brand) => void;
  onBack: () => void;
}

export default function BrandSelector({
  tipoDispositivo,
  onSelect,
  onBack,
}: BrandSelectorProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`${API_URL}/brands`)
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar marcas");
        return res.json();
      })
      .then((data) => {
        setBrands(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Error cargando las marcas. Por favor intente nuevamente.");
        setLoading(false);
      });
  }, [tipoDispositivo]);

  const filteredBrands = brands.filter((brand) =>
    brand.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleDeleteBrand = async () => {
    if (!brandToDelete) return;

    setDeletingBrandId(brandToDelete.id);

    try {
      const response = await apiFetch(`${API_URL}/brands/${brandToDelete.id}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Error al eliminar la marca");
      }

      setBrands((prev) =>
        prev.filter((brand) => brand.id !== brandToDelete.id),
      );
      setBrandToDelete(null);

      showToast.success(
        `Marca "${brandToDelete.name}" eliminada correctamente`,
      );
    } catch (err) {
      console.error(err);
      alert("No se pudo eliminar la marca. Por favor intente nuevamente.");
    } finally {
      setDeletingBrandId(null);
    }
  };

  const renderDeviceIcon = () => {
    const iconProps = { size: 20, className: styles.deviceIcon };
    switch (tipoDispositivo) {
      case "movil":
        return <Smartphone {...iconProps} />;
      case "tablet":
        return <Tablet {...iconProps} />;
      case "computador":
        return <Laptop {...iconProps} />;
      case "otro":
        return <CircleEllipsis {...iconProps} />;
      default:
        return null;
    }
  };

  const handleAddBrand = async () => {
    const brandName = newBrand.trim() || searchTerm.trim();
    if (!brandName) return;

    setPosting(true);
    setPostError(null);

    try {
      const response = await apiFetch(`${API_URL}/brands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: brandName,
            deviceType: tipoDispositivo,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Error al crear la marca");
      }

      const created = await response.json();
      setBrands((prev) => [...prev, created]);
      setNewBrand("");
      setShowForm(false);
      setSearchTerm("");

      onSelect(created);
    } catch (err) {
      console.error(err);
      setPostError(
        "No se pudo agregar la marca. Por favor intente nuevamente.",
      );
    } finally {
      setPosting(false);
    }
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setNewBrand("");
    setPostError(null);
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  return (
    <div className={styles.container}>
      <BackButtonHeader title="Seleccione la marca" onBack={onBack} />

      <div className={styles.searchSection}>
        <div className={styles.searchWrapper}>
          <Search size={20} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Buscar marca..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
          {searchTerm && (
            <button
              onClick={clearSearch}
              className={styles.clearButton}
              aria-label="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <button
          className={styles.addButton}
          onClick={() => {
            // Pre-rellena el nombre con lo que el usuario ya escribió en la búsqueda
            if (!showForm && searchTerm.trim()) setNewBrand(searchTerm.trim());
            setShowForm((v) => !v);
          }}
          disabled={posting}
        >
          <Plus size={16} />
          Agregar nueva marca
        </button>
      </div>

      {showForm && (
        <div className={styles.formSection}>
          <div className={styles.formCard}>
            <h3 className={styles.formTitle}>Agregar nueva marca</h3>
            <div className={styles.formContent}>
              <input
                type="text"
                placeholder="Nombre de la marca"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                className={styles.formInput}
                disabled={posting}
                onKeyPress={(e) => e.key === "Enter" && handleAddBrand()}
              />
              <div className={styles.formActions}>
                <button
                  onClick={handleCancelForm}
                  className={styles.cancelButton}
                  disabled={posting}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddBrand}
                  className={styles.submitButton}
                  disabled={posting || (!newBrand.trim() && !searchTerm.trim())}
                >
                  {posting ? (
                    <>
                      <Loader2 size={16} className={styles.spinner} />
                      Agregando...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      Agregar
                    </>
                  )}
                </button>
              </div>
            </div>
            {postError && (
              <div className={styles.errorMessage}>{postError}</div>
            )}
          </div>
        </div>
      )}

      <div className={styles.brandsSection}>
        {searchTerm && (
          <div className={styles.searchResults}>
            Mostrando {filteredBrands.length} resultado
            {filteredBrands.length !== 1 ? "s" : ""}
            {searchTerm && ` para "${searchTerm}"`}
          </div>
        )}

        {loading ? (
          <div className={styles.loadingState}>
            <Loader2 size={24} className={styles.spinner} />
            <p>Cargando marcas...</p>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <p className={styles.errorText}>{error}</p>
            <button
              onClick={() => window.location.reload()}
              className={styles.retryButton}
            >
              Reintentar
            </button>
          </div>
        ) : filteredBrands.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No se encontraron marcas</p>
            {searchTerm && (
              <p className={styles.emptySubtext}>
                Intenta con otro término de búsqueda o agrega una nueva marca
              </p>
            )}
          </div>
        ) : (
          <div className={styles.brandsGrid}>
            {filteredBrands.map((brand) => (
              <div
                key={brand.id}
                className={`${styles.brandCard} ${
                  deletingBrandId === brand.id ? styles.brandCardDeleting : ""
                }`}
                role="button"
                tabIndex={0}
              >
                <div
                  className={styles.brandContent}
                  onClick={() => onSelect(brand)}
                  onKeyPress={(e) => e.key === "Enter" && onSelect(brand)}
                >
                  <span className={styles.brandName}>{brand.name}</span>
                  <div className={styles.deviceBadge}>{renderDeviceIcon()}</div>
                </div>

                <button
                  className={styles.deleteButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    setBrandToDelete(brand);
                  }}
                  disabled={deletingBrandId === brand.id}
                  aria-label={`Eliminar marca ${brand.name}`}
                  title="Eliminar marca"
                >
                  {deletingBrandId === brand.id ? (
                    <Loader2 size={14} className={styles.spinner} />
                  ) : (
                    <X size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {brandToDelete && (
        <div
          className={styles.confirmOverlay}
          onClick={() => setBrandToDelete(null)}
        >
          <div
            className={styles.confirmDialog}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className={styles.confirmTitle}>¿Eliminar marca?</h4>
            <p className={styles.confirmMessage}>
              ¿Estás seguro de que deseas eliminar{" "}
              <strong>{brandToDelete.name}</strong>? Esta acción no se puede
              deshacer.
            </p>
            <div className={styles.confirmActions}>
              <button
                onClick={() => setBrandToDelete(null)}
                className={styles.confirmCancelButton}
                disabled={deletingBrandId === brandToDelete.id}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteBrand}
                className={styles.confirmDeleteButton}
                disabled={deletingBrandId === brandToDelete.id}
              >
                {deletingBrandId === brandToDelete.id ? (
                  <>
                    <Loader2 size={16} className={styles.spinner} />
                    Eliminando...
                  </>
                ) : (
                  "Eliminar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
