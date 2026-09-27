"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, useEffect } from "react";
import {
  Search,
  UserPlus,
  Edit,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  MessageSquare,
} from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const DniType = {
  NIF: "NIF",
  NIE: "NIE",
  PASSPORT: "PASSPORT",
};

const ContactMethod = {
  EMAIL: "EMAIL",
  PHONE: "PHONE",
  SMS: "SMS",
};

export default function Clients() {
  const router = useRouter();
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({
    key: "createdAt",
    direction: "desc",
  });
  const itemsPerPage = 8;

  useEffect(() => {
    const fetchClients = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiFetch(`${API_URL}/clients`);
        if (!response.ok) {
          throw new Error(
            `Error ${response.status}: No se pudieron cargar los clientes`
          );
        }
        const data = await response.json();
        setClients(data);
        setFilteredClients(data);
      } catch (err) {
        setError(err.message);
        setClients([]);
        setFilteredClients([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClients();
  }, []);
  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredClients(clients);
    } else {
      const term = searchTerm.toLowerCase();
      const filtered = clients.filter(
        (client) =>
          client.firstName.toLowerCase().includes(term) ||
          client.lastName.toLowerCase().includes(term) ||
          client.dni.toLowerCase().includes(term) ||
          (client.email && client.email.toLowerCase().includes(term)) ||
          (client.phoneNumber && client.phoneNumber.includes(term))
      );
      setFilteredClients(filtered);
    }
    setCurrentPage(1);
  }, [searchTerm, clients]);

  useEffect(() => {
    const sortedClients = [...filteredClients].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });

    setFilteredClients(sortedClients);
  }, [sortConfig]);

  const requestSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentClients = filteredClients.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  const renderContactMethodIcon = (method) => {
    switch (method) {
      case ContactMethod.EMAIL:
        return <Mail className={styles.contactIconEmail} size={18} />;
      case ContactMethod.PHONE:
        return <Phone className={styles.contactIconPhone} size={18} />;
      case ContactMethod.SMS:
        return <MessageSquare className={styles.contactIconSms} size={18} />;
      default:
        return null;
    }
  };

  const handlePageChange = (page) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleAddClient = () => {
    router.push("/clients/newClients");
  };

  const handleViewClient = (id) => {
    router.push(`/clients/${id}`);
  };

  const handleEditClient = (id) => {
    router.push(`/clients/${id}/edit`);
  };

  const handleDeleteClient = async (id: string) => {
    if (!window.confirm("¿Estás seguro de eliminar este cliente?")) return;

    try {
      const response = await apiFetch(`${API_URL}/clients/${id}`, {
        method: "DELETE",
      });

      if (response.status === 403) {
        throw new Error("Solo un super administrador puede eliminar clientes");
      }
      if (!response.ok) {
        throw new Error("Error eliminando cliente");
      }

      setClients((prev) => prev.filter((client) => client.id !== id));
      setFilteredClients((prev) => prev.filter((client) => client.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className={styles.clientsContainer}>
      {/* Header */}
      <div className={styles.clientsHeader}>
        <div className={styles.titleContainer}>
          <h1 className={styles.pageTitle}>Clientes</h1>
          <span className={styles.clientsCount}>
            {filteredClients.length} clientes en total
          </span>
        </div>
        <button className={styles.addClientBtn} onClick={handleAddClient}>
          <UserPlus size={18} />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      {/* Filtros y búsqueda */}
      <div className={styles.filtersContainer}>
        <div className={styles.searchContainer}>
          <Search size={20} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Buscar por nombre, DNI, email o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Contenido principal */}
      {isLoading ? (
        <div className={styles.loadingContainer}>
          <div className={styles.loader}></div>
          <p>Cargando clientes...</p>
        </div>
      ) : error ? (
        <div className={styles.errorContainer}>
          <span>{error}</span>
          <button onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      ) : (
        <>
          {/* Tabla de clientes */}
          <div className={styles.tableContainer}>
            <table className={styles.clientsTable}>
              <thead>
                <tr>
                  <th onClick={() => requestSort("firstName")}>
                    Cliente
                    <span
                      className={`${styles.sortIndicator} ${
                        sortConfig.key === "firstName"
                          ? styles[sortConfig.direction]
                          : ""
                      }`}
                    ></span>
                  </th>
                  <th onClick={() => requestSort("dni")}>
                    Identificación
                    <span
                      className={`${styles.sortIndicator} ${
                        sortConfig.key === "dni"
                          ? styles[sortConfig.direction]
                          : ""
                      }`}
                    ></span>
                  </th>
                  <th onClick={() => requestSort("preferredContact")}>
                    Contacto
                    <span
                      className={`${styles.sortIndicator} ${
                        sortConfig.key === "preferredContact"
                          ? styles[sortConfig.direction]
                          : ""
                      }`}
                    ></span>
                  </th>
                  <th onClick={() => requestSort("city")}>
                    Ubicación
                    <span
                      className={`${styles.sortIndicator} ${
                        sortConfig.key === "city"
                          ? styles[sortConfig.direction]
                          : ""
                      }`}
                    ></span>
                  </th>
                  <th onClick={() => requestSort("isActive")}>
                    Estado
                    <span
                      className={`${styles.sortIndicator} ${
                        sortConfig.key === "isActive"
                          ? styles[sortConfig.direction]
                          : ""
                      }`}
                    ></span>
                  </th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {currentClients.map((client) => (
                  <tr key={client.id}>
                    <td className={styles.clientNameCell}>
                      <div className={styles.clientAvatar}>
                        {client.firstName.charAt(0)}
                        {client.lastName.charAt(0)}
                      </div>
                      <div className={styles.clientInfo}>
                        <span className={styles.clientFullname}>
                          {client.firstName} {client.lastName}
                        </span>
                        <span className={styles.clientEmail}>
                          {client.email}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.dniContainer}>
                        <span className={styles.dniType}>{client.dniType}</span>
                        <span className={styles.dniNumber}>{client.dni}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.contactContainer}>
                        {renderContactMethodIcon(client.preferredContact)}
                        <span>{client.phoneNumber}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.locationContainer}>
                        <span className={styles.city}>{client.city}</span>
                        <span className={styles.postalCode}>
                          {client.postalCode}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${
                          client.isActive ? styles.active : styles.inactive
                        }`}
                      >
                        {client.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionsContainer}>
                        <button
                          className={`${styles.actionBtn} ${styles.view}`}
                          onClick={() => handleViewClient(client.id)}
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          className={`${styles.actionBtn} ${styles.edit}`}
                          onClick={() => handleEditClient(client.id)}
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          className={`${styles.actionBtn} ${styles.delete}`}
                          onClick={() => handleDeleteClient(client.id)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mensaje si no hay resultados */}
          {filteredClients.length === 0 && (
            <div className={styles.noResults}>
              <p>No se encontraron clientes con los criterios de búsqueda.</p>
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <div className={styles.paginationInfo}>
                Mostrando <span>{startIndex + 1}</span> a{" "}
                <span>
                  {Math.min(startIndex + itemsPerPage, filteredClients.length)}
                </span>{" "}
                de <span>{filteredClients.length}</span> clientes
              </div>
              <div className={styles.paginationControls}>
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`${styles.paginationBtn} ${styles.prev} ${
                    currentPage === 1 ? styles.disabled : ""
                  }`}
                >
                  <ChevronLeft size={16} />
                </button>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNumber;
                  if (totalPages <= 5) {
                    pageNumber = i + 1;
                  } else if (currentPage <= 3) {
                    pageNumber = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNumber = totalPages - 4 + i;
                  } else {
                    pageNumber = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNumber}
                      onClick={() => handlePageChange(pageNumber)}
                      className={`${styles.paginationBtn} ${
                        currentPage === pageNumber ? styles.active : ""
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`${styles.paginationBtn} ${styles.next} ${
                    currentPage === totalPages ? styles.disabled : ""
                  }`}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
