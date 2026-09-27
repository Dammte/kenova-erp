"use client";

import { API_URL, apiFetch } from "@/lib/api";

import React, { useState, useEffect, useMemo, useCallback } from "react";

// ── Fuzzy search helpers ───────────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val =
        a[i - 1] === b[j - 1]
          ? row[j - 1]
          : 1 + Math.min(row[j - 1], row[j], prev);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/** Score how well a single query token matches a single item token (0–3) */
function tokenScore(qt: string, it: string): number {
  if (it === qt) return 3;
  if (it.startsWith(qt) && qt.length >= 2) return 2;
  const threshold = qt.length <= 4 ? 1 : 2;
  if (levenshtein(qt, it) <= threshold) return 1;
  return 0;
}

/** Returns relevance score (0 = no match, higher = better match) */
function searchScore(query: string, item: Inventory): number {
  if (!query.trim()) return 1;

  const tokens = normalizeStr(query)
    .split(" ")
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return 1;

  const itemText = normalizeStr(
    [item.nombre, item.sku, item.descripcion, item.categoria, item.marca, item.modelo].join(" ")
  );
  const itemTokens = itemText.split(" ").filter((t) => t.length >= 1);

  let totalScore = 0;
  let matchedCount = 0;

  for (const qt of tokens) {
    let best = 0;
    for (const it of itemTokens) {
      const s = tokenScore(qt, it);
      if (s > best) best = s;
    }
    if (best > 0) matchedCount++;
    totalScore += best;
  }

  // Require at least 60% of query tokens to match something
  if (matchedCount < Math.ceil(tokens.length * 0.6)) return 0;

  return totalScore;
}
import {
  Search,
  Plus,
  Download,
  Edit3,
  Trash2,
  Eye,
  AlertTriangle,
  SortAsc,
  SortDesc,
  Filter,
  FileUp,
} from "lucide-react";
import Link from "next/link";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { showToast } from "nextjs-toast-notify";
import ImportModal from "./components/ImportModal";

interface Inventory {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  marca: string;
  modelo: string;
  sku: string;
  ubicacion: string;
  proveedor: string;
  stockActual: number;
  stockMinimo: number;
  precioVenta: number;
  precioCosto: number;
  imagen?: string;
  fechaCreacion: Date;
  ultimaActualizacion: Date;
}

const Inventory: React.FC = () => {
  const [repuestos, setRepuestos] = useState<Inventory[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("Todas");
  const [marcaFiltro, setMarcaFiltro] = useState("Todas");
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const categorias = useMemo(() => {
    const uniqueCats = Array.from(new Set(repuestos.map((r) => r.categoria)));
    return ["Todas", ...uniqueCats];
  }, [repuestos]);

  const marcas = useMemo(() => {
    const uniqueMarcas = Array.from(new Set(repuestos.map((r) => r.marca)));
    return ["Todas", ...uniqueMarcas];
  }, [repuestos]);

  const fetchRepuestos = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_URL}/inventory`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformedData = data.map((inventory: any) => ({
        id: inventory.id,
        nombre: inventory.name,
        descripcion: inventory.description || "",
        categoria: inventory.category || "",
        marca: inventory.brand || "",
        modelo: inventory.model || "",
        sku: inventory.sku,
        ubicacion: inventory.ubication || "",
        proveedor: inventory.provider || "",
        stockActual: inventory.stock || 0,
        stockMinimo: inventory.minimalStock || 0,
        precioVenta:
          inventory.salesPrice != null ? Number(inventory.salesPrice) : 0,
        precioCosto: inventory.costPrice
          ? parseFloat(inventory.costPrice)
          : 0,
        imagen: inventory.imagePath || "",
        fechaCreacion: new Date(inventory.createdAt),
        ultimaActualizacion: new Date(inventory.updatedAt),
      }));
      setRepuestos(transformedData);
    } catch (error) {
      console.error(error);
      showToast.error("Error al cargar los repuestos", {
        duration: 5000,
        position: "top-right",
      });
      setError(
        "Hubo un error al cargar los datos. Por favor, intenta de nuevo."
      );
    } finally {
      setIsLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchRepuestos();
  }, [fetchRepuestos]);

  const repuestosFiltrados = useMemo(() => {
    return repuestos
      .filter((repuesto) => {
        const matchCategoria =
          categoriaFiltro === "Todas" || repuesto.categoria === categoriaFiltro;
        const matchMarca =
          marcaFiltro === "Todas" || repuesto.marca === marcaFiltro;
        if (!matchCategoria || !matchMarca) return false;
        return searchScore(busqueda, repuesto) > 0;
      })
      .sort((a, b) => {
        // When user typed something, sort by relevance first
        if (busqueda.trim()) {
          return searchScore(busqueda, b) - searchScore(busqueda, a);
        }
        return 0;
      });
  }, [repuestos, busqueda, categoriaFiltro, marcaFiltro]);

  const repuestosOrdenados = useMemo(() => [...repuestosFiltrados].sort((a, b) => {
    if (!sortBy) return 0;

    let valA = a[sortBy as keyof Inventory] as string | number | Date;
    let valB = b[sortBy as keyof Inventory] as string | number | Date;

    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();

    if (valA < valB) return sortDirection === "asc" ? -1 : 1;
    if (valA > valB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  }), [repuestosFiltrados, sortBy, sortDirection]);

  const handleSort = (columna: string) => {
    if (sortBy === columna) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(columna);
      setSortDirection("asc");
    }
  };

  const descargarInventario = () => {
    const datosExcel = repuestosFiltrados.map((r) => ({
      SKU: r.sku,
      Nombre: r.nombre,
      Categoría: r.categoria,
      Marca: r.marca,
      Modelo: r.modelo,
      "Stock Actual": r.stockActual,
      "Stock Mínimo": r.stockMinimo,
      "Precio Venta": `$${r.precioVenta.toFixed(2)}`,
      "Precio Costo": `$${r.precioCosto.toFixed(2)}`,
      Ubicación: r.ubicacion,
      Proveedor: r.proveedor,
    }));

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const data = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const fecha = new Date().toISOString().split("T")[0];
    saveAs(data, `Inventario_Repuestos_${fecha}.xlsx`);
  };

  const handleEliminar = (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar este repuesto?")) {
      const copiaOriginal = [...repuestos];

      setRepuestos((prev) => prev.filter((repuesto) => repuesto.id !== id));

      apiFetch(`${API_URL}/inventory/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      })
        .then((response) => {
          if (!response.ok) throw new Error("Error al eliminar el repuesto");
          showToast.success("Repuesto eliminado con éxito", {
            duration: 5000,
            position: "top-right",
          });
        })
        .catch((error) => {
          console.error("Error:", error);
          setRepuestos(copiaOriginal);
          setError(`Error al eliminar: ${error.message}`);
        });
    }
  };

  const getImagen = (repuesto: Inventory) => {
    if (repuesto.imagen) {
      return (
        <div className="relative h-32 w-full rounded-t-lg bg-gray-100 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <span className="text-xs text-center">Imagen del repuesto</span>
          </div>
        </div>
      );
    }
    return (
      <div className="h-32 w-full rounded-t-lg bg-gray-200 flex items-center justify-center">
        <span className="text-gray-500 text-sm">Sin imagen</span>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Cabecera y Acciones */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Inventario de Repuestos
          </h1>
          <p className="text-gray-600">
            {repuestosFiltrados.length} repuestos encontrados
            {busqueda || categoriaFiltro !== "Todas" || marcaFiltro !== "Todas"
              ? " con los filtros aplicados"
              : ""}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <button
            onClick={descargarInventario}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white-600 text-black rounded-md
            hover:bg-light-gray-700 transition-colors cursor-pointer shadow-sm border border-gray-300"
          >
            <Download size={18} />
            <span>Exportar</span>
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-md hover:bg-gray-50 transition-colors cursor-pointer shadow-sm border border-gray-300"
          >
            <FileUp size={18} />
            <span>Importar Factura</span>
          </button>
          <Link
            href="/inventory/add-part"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-zinc-700 transition-colors"
          >
            <Plus size={18} />
            <span>Nuevo Repuesto</span>
          </Link>
        </div>
      </div>

      {/* Búsqueda y Filtros */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, SKU o descripción..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <button
            className="md:hidden flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-700"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
          >
            <Filter size={18} />
            <span>Filtros</span>
          </button>

          <div className="hidden md:flex gap-4">
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-600 bg-white"
            >
              {categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "Todas" ? "Todas las categorías" : cat}
                </option>
              ))}
            </select>

            <select
              value={marcaFiltro}
              onChange={(e) => setMarcaFiltro(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-600 bg-white"
            >
              {marcas.map((marca) => (
                <option key={marca} value={marca}>
                  {marca === "Todas" ? "Todas las marcas" : marca}
                </option>
              ))}
            </select>

            <button
              onClick={() => handleSort("stockActual")}
              className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
            >
              {sortBy === "stockActual" ? (
                sortDirection === "asc" ? (
                  <SortAsc size={16} />
                ) : (
                  <SortDesc size={16} />
                )
              ) : (
                <SortAsc size={16} />
              )}
              <span>Stock</span>
            </button>
          </div>
        </div>

        {mostrarFiltros && (
          <div className="md:hidden mt-4 flex flex-col gap-3">
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-600 bg-white"
            >
              {categorias.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === "Todas" ? "Todas las categorías" : cat}
                </option>
              ))}
            </select>

            <select
              value={marcaFiltro}
              onChange={(e) => setMarcaFiltro(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-600 bg-white"
            >
              {marcas.map((marca) => (
                <option key={marca} value={marca}>
                  {marca === "Todas" ? "Todas las marcas" : marca}
                </option>
              ))}
            </select>

            <button
              onClick={() => handleSort("stockActual")}
              className="flex items-center justify-center gap-1 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
            >
              {sortBy === "stockActual" ? (
                sortDirection === "asc" ? (
                  <SortAsc size={16} />
                ) : (
                  <SortDesc size={16} />
                )
              ) : (
                <SortAsc size={16} />
              )}
              <span>Ordenar por Stock</span>
            </button>
          </div>
        )}
      </div>

      {/* Renderizado de estado */}
      {error ? (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
          role="alert"
        >
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : repuestosOrdenados.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="bg-gray-100 p-3 rounded-full mb-4">
              <Search size={36} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">
              No se encontraron repuestos
            </h3>
            <p className="text-gray-600 mb-6">
              No hay repuestos que coincidan con tu búsqueda o filtros
              aplicados.
            </p>
            <button
              onClick={() => {
                setBusqueda("");
                setCategoriaFiltro("Todas");
                setMarcaFiltro("Todas");
              }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-gray-700"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {repuestosOrdenados.map((repuesto) => (
            <div
              key={repuesto.id}
              className="bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
            >
              {getImagen(repuesto)}

              <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3
                    className="font-medium text-gray-800 line-clamp-2 flex-1 leading-snug"
                    title={repuesto.nombre}
                  >
                    {repuesto.nombre}
                  </h3>
                  {(repuesto.stockActual < 0 || (repuesto.stockMinimo > 0 && repuesto.stockActual <= repuesto.stockMinimo)) && (
                    <span
                      className="inline-flex items-center"
                      title="Stock bajo del mínimo recomendado"
                    >
                      <AlertTriangle size={16} className="text-amber-500" />
                    </span>
                  )}
                </div>

                <p
                  className="text-sm text-gray-500 mb-3 line-clamp-2"
                  title={repuesto.descripcion}
                >
                  {repuesto.descripcion}
                </p>

                <div className="flex flex-col gap-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">SKU</span>
                    <span className="text-xs font-medium">{repuesto.sku}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Categoría</span>
                    <span className="text-xs font-medium">
                      {repuesto.categoria}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Marca</span>
                    <span className="text-xs font-medium">
                      {repuesto.marca}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Stock</span>
                    <div>
                      <span
                        className={`text-xs font-bold ${
                          repuesto.stockMinimo === 0
                            ? repuesto.stockActual > 0 ? "text-green-600" : "text-amber-600"
                            : repuesto.stockActual <= 0
                            ? "text-red-600"
                            : repuesto.stockActual <= repuesto.stockMinimo
                            ? "text-amber-600"
                            : "text-green-600"
                        }`}
                      >
                        {repuesto.stockActual}
                      </span>
                      <span className="text-xs text-gray-400">
                        /{repuesto.stockMinimo} min.
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Precio</span>
                    <span className="text-xs font-medium">
                      ${repuesto.precioVenta.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full ${
                      repuesto.stockMinimo === 0
                        ? repuesto.stockActual > 0 ? "bg-green-600" : "bg-amber-500"
                        : repuesto.stockActual <= 0
                        ? "bg-red-600"
                        : repuesto.stockActual <= repuesto.stockMinimo
                        ? "bg-amber-500"
                        : "bg-green-600"
                    }`}
                    style={{
                      width: `${repuesto.stockMinimo === 0
                        ? (repuesto.stockActual > 0 ? 100 : 0)
                        : Math.min(100, (repuesto.stockActual / (repuesto.stockMinimo * 2)) * 100)
                      }%`,
                    }}
                  />
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/inventory/${repuesto.id}`}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 text-sm transition-colors"
                  >
                    <Eye size={14} />
                    <span>Ver</span>
                  </Link>

                  <Link
                    href={`/inventory/${repuesto.id}/edit`}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-sm transition-colors"
                  >
                    <Edit3 size={14} />
                    <span>Editar</span>
                  </Link>

                  <button
                    onClick={() => handleEliminar(repuesto.id)}
                    className="flex items-center justify-center px-2 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-sm transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Import Modal ── */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          setShowImportModal(false);
          fetchRepuestos();
          showToast.success("Importación completada. Inventario actualizado.", {
            duration: 4000,
            position: "top-right",
          });
        }}
        existingItems={repuestos.map((r) => ({
          sku: r.sku,
          id: r.id,
          name: r.nombre,
        }))}
        apiUrl={API_URL ?? ""}
      />
    </div>
  );
};

export default Inventory;
