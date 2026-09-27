"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Edit, ArrowLeft, Camera } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

interface PartDetails {
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

export default function ViewPart() {
  const router = useRouter();
  const { id } = useParams();
  const [part, setPart] = useState<PartDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPart = async () => {
      try {
        const response = await apiFetch(`${API_URL}/inventory/${id}`
        );
        if (!response.ok) throw new Error("Repuesto no encontrado");
        const data = await response.json();
        setPart(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPart();
  }, [id]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Cargando información del repuesto...</p>
      </div>
    );
  }

  if (error || !part) {
    return (
      <div className={styles.errorContainer}>
        <p>{error || "Error al cargar el repuesto"}</p>
        <button onClick={() => router.back()}>Volver al inventario</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/inventory" className={styles.backButton}>
          <ArrowLeft size={18} />
          <span>Volver al Inventario</span>
        </Link>
        <div className={styles.headerActions}>
          <button
            className={styles.editButton}
            onClick={() => router.push(`/inventory/${id}/edit`)}
          >
            <Edit size={16} /> Editar
          </button>
        </div>
      </div>

      <div className={styles.partHeader}>
        {part.imagePath ? (
          <img
            src={part.imagePath}
            alt={part.name}
            className={styles.partImage}
          />
        ) : (
          <div className={styles.imagePlaceholder}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
              />
            </svg>
            <span>Imagen no disponible</span>
          </div>
        )}
        <div>
          <h1 className={styles.title}>{part.name}</h1>
          <div className={styles.metaInfo}>
            <span>SKU: {part.sku}</span>
            <span>Creado: {new Date(part.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className={styles.detailsGrid}>
        {/* Sección de Información Básica */}
        <div className={styles.section}>
          <h2>Información Básica</h2>
          <DetailItem label="Categoría" value={part.category} />
          <DetailItem label="Marca" value={part.brand} />
          <DetailItem label="Modelo" value={part.model} />
          <DetailItem label="Descripción" value={part.description} />
        </div>

        {/* Sección de Inventario */}
        <div className={styles.section}>
          <h2>Inventario</h2>
          <DetailItem
            label="Stock Actual"
            value={part.stock?.toString() ?? "N/A"}
          />
          <DetailItem
            label="Stock Mínimo"
            value={part.minimalStock?.toString() ?? "N/A"}
          />
        </div>

        {/* Sección de Precios */}
        {/* Sección de Precios */}
        <div className={styles.section}>
          <h2>Precios</h2>
          <DetailItem label="Precio de Venta" value={part.salesPrice} />
          <DetailItem label="Precio de Costo" value={part.costPrice} />
        </div>

        {/* Sección de Proveedor */}
        <div className={styles.section}>
          <h2>Proveedor</h2>
          <DetailItem
            label="Proveedor"
            value={part.provider || "No especificado"}
          />
          <DetailItem
            label="Última Actualización"
            value={new Date(part.updatedAt).toLocaleDateString()}
          />
        </div>
      </div>
    </div>
  );
}

interface DetailItemProps {
  label: string;
  value: string | number | null | undefined;
}

const DetailItem = ({ label, value }: DetailItemProps) => {
  const formatValue = () => {
    if (value === null || value === undefined) return "N/A";

    if (typeof value === "number") {
      return `$${value.toFixed(2)}`;
    }

    return value;
  };

  return (
    <div className={styles.detailItem}>
      <label>{label}</label>
      <p>{formatValue()}</p>
    </div>
  );
};
