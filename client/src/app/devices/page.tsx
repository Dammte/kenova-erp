"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  Eye,
  Edit,
  Trash,
  Smartphone,
  Tablet,
  Monitor,
  PlusCircle,
  AlertCircle,
  Download,
  Filter,
  RefreshCw,
} from "lucide-react";
import styles from "./page.module.css";

export default function Devices() {
  const [isLoading, setIsLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState(null);
  const [deviceType, setDeviceType] = useState("desktop");
  const [filter, setFilter] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width <= 767) {
        setDeviceType("mobile");
      } else if (width <= 1024) {
        setDeviceType("tablet");
      } else {
        setDeviceType("desktop");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.imei.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.dni.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.telefono?.toString() || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesFilter =
      filter === "all" || device.estado.toLowerCase() === filter.toLowerCase();

    return matchesSearch && matchesFilter;
  });

  const fetchDevices = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${API_URL}/devices`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      const transformedData = data.map((device) => ({
        id: device.id,
        marca: device.brand,
        modelo: device.model,
        imei: device.imei,
        estado: device.status || "Pendiente",
        dni: device.owner?.dni || "-",
        nombre: device.owner?.name || "-",
        telefono: device.owner?.phone || "-",
        email: device.owner?.email || "-",
        fecha: device.createdAt
          ? new Date(device.createdAt).toLocaleDateString()
          : "-",
      }));

      setDevices(transformedData);
    } catch (error) {
      console.error("Error al cargar los dispositivos:", error);
      setError(
        "No se pudieron cargar los dispositivos. Por favor, verifica la conexión con el servidor."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchDevices();
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleFilterChange = (e) => {
    setFilter(e.target.value);
  };

  const handleViewDetails = (id) => {
    console.log(`Ver detalles del dispositivo con ID: ${id}`);
  };

  const handleEdit = (id) => {
    console.log(`Editando dispositivo con ID: ${id}`);
  };

  const handleDelete = (id) => {
    console.log(`Eliminando dispositivo con ID: ${id}`);
  };

  const handleExportData = () => {
    console.log("Exportando datos");
  };

  const getBadgeClass = (estado) => {
    switch (estado.toLowerCase()) {
      case "activo":
        return styles.badgeActive;
      case "pendiente":
        return styles.badgePending;
      case "inactivo":
        return styles.badgeInactive;
      default:
        return styles.badgeDefault;
    }
  };

  const renderDeviceIcon = (device) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className={styles.deviceIcon} />;
      case "tablet":
        return <Tablet className={styles.deviceIcon} />;
      case "desktop":
      default:
        return <Monitor className={styles.deviceIcon} />;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h1 className={styles.title}>Dispositivos</h1>
          <p className={styles.subtitle}>
            {filteredDevices.length} de {devices.length} dispositivos
            {filter !== "all" ? ` (filtrado por: ${filter})` : ""}
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            className={`${styles.actionButton} ${styles.refreshButton} ${
              isRefreshing ? styles.spinning : ""
            }`}
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            title="Actualizar lista"
          >
            <RefreshCw size={18} />
          </button>

          <button
            className={`${styles.actionButton} ${styles.exportButton}`}
            onClick={handleExportData}
            title="Exportar datos"
          >
            <Download size={18} />
          </button>

          <Link href="/devices/newDevices" className={styles.newButton}>
            <PlusCircle size={18} />
            <span>Nuevo Dispositivo</span>
          </Link>
        </div>
      </div>

      <div className={styles.toolBar}>
        <div className={styles.searchBox}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="search"
            placeholder="Buscar por marca, modelo, IMEI, DNI o propietario..."
            value={searchTerm}
            onChange={handleSearch}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterContainer}>
          <Filter size={16} className={styles.filterIcon} />
          <select
            value={filter}
            onChange={handleFilterChange}
            className={styles.filterSelect}
          >
            <option value="all">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="pendiente">Pendiente</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p>Cargando dispositivos...</p>
        </div>
      ) : error ? (
        <div className={styles.errorContainer}>
          <AlertCircle size={24} className={styles.errorIcon} />
          <p>{error}</p>
          <button className={styles.retryButton} onClick={fetchDevices}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>DISPOSITIVO</th>
                <th>PROPIETARIO</th>
                <th>CONTACTO</th>
                <th>IMEI</th>
                <th>FECHA</th>
                <th>ESTADO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.length > 0 ? (
                filteredDevices.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <div className={styles.deviceInfo}>
                        <div className={styles.deviceAvatar}>
                          {renderDeviceIcon(device)}
                        </div>
                        <div className={styles.deviceDetails}>
                          <div className={styles.deviceName}>
                            {device.marca.name} {device.modelo}
                          </div>
                          <div className={styles.deviceDate}>
                            Registrado: {device.fecha}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.ownerInfo}>
                        <div className={styles.ownerName}>{device.nombre}</div>
                        <div className={styles.ownerDni}>DNI: {device.dni}</div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.contactInfo}>
                        <div className={styles.contactPhone}>
                          {device.telefono}
                        </div>
                        <div className={styles.contactEmail}>
                          {device.email}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={styles.imeiContainer}>{device.imei}</div>
                    </td>
                    <td>
                      <div className={styles.dateInfo}>{device.fecha}</div>
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${getBadgeClass(
                          device.estado
                        )}`}
                      >
                        {device.estado}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={`${styles.actionButton} ${styles.viewButton}`}
                          title="Ver detalles"
                          onClick={() => handleViewDetails(device.id)}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className={`${styles.actionButton} ${styles.editButton}`}
                          title="Editar dispositivo"
                          onClick={() => handleEdit(device.id)}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          className={`${styles.actionButton} ${styles.deleteButton}`}
                          title="Eliminar dispositivo"
                          onClick={() => handleDelete(device.id)}
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className={styles.emptyState}>
                    <div className={styles.emptyContainer}>
                      <AlertCircle size={32} className={styles.emptyIcon} />
                      <p>No se encontraron dispositivos</p>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm("")}
                          className={styles.clearSearchButton}
                        >
                          Limpiar búsqueda
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
