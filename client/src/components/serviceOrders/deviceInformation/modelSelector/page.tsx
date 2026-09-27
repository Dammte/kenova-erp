"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, useEffect } from "react";
import BackButtonHeader from "../backButtonHeader/page";
import styles from "./page.module.css";
import { Search } from "lucide-react";
import { showToast } from "nextjs-toast-notify";

interface Brand {
  id: string;
  name: string;
}

interface ModelSelectorProps {
  tipoDispositivo: string;
  brand: Brand;
  onSelect: (modelName: string) => void;
  onBack: () => void;
}

export default function ModelSelector({
  tipoDispositivo,
  brand,
  onSelect,
  onBack,
}: ModelSelectorProps) {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchModels();
  }, [brand, tipoDispositivo]);

  const fetchModels = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch(`${API_URL}/models?brandId=${encodeURIComponent(
          brand.id,
        )}&deviceType=${encodeURIComponent(tipoDispositivo)}`,
      );

      if (!response.ok) {
        throw new Error("Error al cargar los modelos");
      }

      const data = await response.json();
      setModels(data || []);
    } catch (err) {
      setError(err.message);
      console.error("Error fetching models:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();

    const modelName = newModelName.trim() || searchTerm.trim();

    if (!modelName) {
      showToast.error("Por favor ingrese un nombre para el modelo", {
        duration: 5000,
        position: "top-right",
      });
      return;
    }

    try {
      setCreating(true);

      const response = await apiFetch(`${API_URL}/models`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: modelName.toUpperCase(),
            brandId: brand.id,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al crear el modelo");
      }

      const newModel = await response.json();
      setModels((prev) => [...prev, newModel]);
      setNewModelName("");
      setShowCreateForm(false);
      setSearchTerm("");

      // Seleccionar automáticamente el modelo recién creado
      onSelect(newModel.name);
    } catch (err) {
      showToast.error(
        "Error al crear el modelo. Por favor, inténtalo de nuevo.",
        {
          duration: 5000,
          position: "top-right",
        },
      );
      console.error("Error creating model:", err);
    } finally {
      setCreating(false);
    }
  };

  const filteredModels = models.filter(
    (model) =>
      model.brandId === brand.id &&
      model.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleModelSelect = (modelName: string) => {
    onSelect(modelName);
  };

  if (loading) {
    return (
      <div className={styles.progressWrapper}>
        <BackButtonHeader title="Seleccione el modelo" onBack={onBack} />
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Cargando modelos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.progressWrapper}>
        <BackButtonHeader title="Seleccione el modelo" onBack={onBack} />
        <div className={styles.errorContainer}>
          <div className={styles.errorIcon}>⚠️</div>
          <h3 className={styles.errorTitle}>Error al cargar modelos</h3>
          <p className={styles.errorMessage}>{error}</p>
          <button onClick={fetchModels} className={styles.retryButton}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.progressWrapper}>
      <BackButtonHeader title="Seleccione el modelo" onBack={onBack} />

      <div className={styles.content}>
        <div className={styles.header}>
          <h2 className={styles.subtitle}>
            Modelos disponibles para {brand.name}
          </h2>
          <p className={styles.description}>
            Seleccione el modelo de su dispositivo o cree uno nuevo
          </p>
        </div>

        <div className={styles.searchSection}>
          <div className={styles.searchWrapper}>
            <Search size={20} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Buscar modelo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={styles.addButton}
          >
            + Agregar nuevo modelo
          </button>
        </div>

        {showCreateForm && (
          <div className={styles.createFormContainer}>
            <form onSubmit={handleCreateModel} className={styles.createForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nombre del modelo</label>
                <input
                  type="text"
                  value={newModelName || searchTerm}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="Ej: iPhone 15 Pro Max"
                  className={styles.formInput}
                  disabled={creating}
                  autoFocus
                />
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewModelName("");
                  }}
                  className={styles.cancelButton}
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={
                    creating || (!newModelName.trim() && !searchTerm.trim())
                  }
                >
                  {creating ? "Creando..." : "Crear modelo"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className={styles.modelsSection}>
          {filteredModels.length > 0 ? (
            <div className={styles.modelsGrid}>
              {filteredModels.map((model) => (
                <button
                  key={model.id || model.name}
                  onClick={() => handleModelSelect(model.name)}
                  className={styles.modelButton}
                >
                  <div className={styles.modelIcon}>📱</div>
                  <span className={styles.modelName}>{model.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📦</div>
              <h3 className={styles.emptyTitle}>
                {searchTerm
                  ? "No se encontraron modelos"
                  : "No hay modelos disponibles"}
              </h3>
              <p className={styles.emptyDescription}>
                {searchTerm
                  ? `No se encontraron modelos que coincidan con "${searchTerm}"`
                  : `Aún no hay modelos registrados para ${brand.name}. ¡Crea el primero!`}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className={styles.emptyActionButton}
                >
                  Crear primer modelo
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
