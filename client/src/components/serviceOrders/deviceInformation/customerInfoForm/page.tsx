"use client";

import { API_URL, apiFetch } from "@/lib/api";

import React, { useState, useEffect, useRef } from "react";
import styles from "./page.module.css";
import Link from "next/link";
import { showToast } from "nextjs-toast-notify";

const PreferredContact = {
  EMAIL: "EMAIL",
  PHONE: "PHONE",
  SMS: "SMS",
};

const DniType = {
  NIF: "NIF",
  NIE: "NIE",
  PASSPORT: "PASSPORT",
};

/* ── DNI algorithm ─────────────────────────────────────────────────────────── */
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const NIE_PREFIX: Record<string, string> = { X: "0", Y: "1", Z: "2" };

type DniStatus = "valid" | "invalid" | "format" | null;

function validateNIF(value: string): DniStatus {
  const clean = value.toUpperCase().trim();
  if (clean.length < 9) return null;
  if (!/^\d{8}[A-Z]$/.test(clean)) return "format";
  const expected = DNI_LETTERS[parseInt(clean.slice(0, 8)) % 23];
  return clean[8] === expected ? "valid" : "invalid";
}

function validateNIE(value: string): DniStatus {
  const clean = value.toUpperCase().trim();
  if (clean.length < 9) return null;
  if (!/^[XYZ]\d{7}[A-Z]$/.test(clean)) return "format";
  const replaced = NIE_PREFIX[clean[0]] + clean.slice(1);
  const expected = DNI_LETTERS[parseInt(replaced.slice(0, 8)) % 23];
  return clean[8] === expected ? "valid" : "invalid";
}

function checkDni(type: string, value: string): DniStatus {
  if (!value || value.trim().length === 0) return null;
  if (type === DniType.NIF) return validateNIF(value);
  if (type === DniType.NIE) return validateNIE(value);
  return null; // passport — skip
}

/* ── Client service ─────────────────────────────────────────────────────────── */
const clientService = {
  async findByDni(dni: string) {
    try {
      const response = await apiFetch(`${API_URL}/clients/search?dni=${encodeURIComponent(dni)}`
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.length > 0 ? data[0] : null;
    } catch {
      return null;
    }
  },

  async searchClients(searchTerm: string) {
    try {
      const response = await apiFetch(`${API_URL}/clients/search?q=${encodeURIComponent(searchTerm)}`
      );
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  },
};

/* ── Postal code API ────────────────────────────────────────────────────────── */
async function fetchCityByPostalCode(postalCode: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.zippopotam.us/es/${postalCode}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.places || data.places.length === 0) return null;
    // When multiple places share the code, join the names
    const names = [...new Set<string>(data.places.map((p: { "place name": string }) => p["place name"]))];
    return names.join(" / ");
  } catch {
    return null;
  }
}

/* ── Component ──────────────────────────────────────────────────────────────── */
export default function CustomerInfoForm({ formState, onChange, onSubmit }) {
  const [loading, setLoading] = useState(false);
  const [clientExists, setClientExists] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [dniSearchLoading, setDniSearchLoading] = useState(false);
  const [dniStatus, setDniStatus] = useState<DniStatus>(null);
  const [postalCodeLoading, setPostalCodeLoading] = useState(false);
  const [postalCodeNotFound, setPostalCodeNotFound] = useState(false);

  const postalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── DNI format validation (instant) ───────────────────────────────────── */
  useEffect(() => {
    const status = checkDni(formState.dniType || DniType.NIF, formState.dni || "");
    setDniStatus(status);
  }, [formState.dni, formState.dniType]);

  /* ── DNI client lookup (debounced 800ms) ────────────────────────────────── */
  useEffect(() => {
    const dniValue = formState.dni;
    if (dniValue && dniValue.length >= 6) {
      const t = setTimeout(() => searchClientByDni(), 800);
      return () => clearTimeout(t);
    } else {
      setClientExists(false);
    }
  }, [formState.dni]);

  /* ── Postal code city lookup (debounced 600ms) ──────────────────────────── */
  useEffect(() => {
    const code = (formState.postalCode || "").trim();
    if (postalDebounceRef.current) clearTimeout(postalDebounceRef.current);

    if (code.length !== 5 || !/^\d{5}$/.test(code)) {
      setPostalCodeNotFound(false);
      return;
    }

    postalDebounceRef.current = setTimeout(async () => {
      setPostalCodeLoading(true);
      setPostalCodeNotFound(false);
      const city = await fetchCityByPostalCode(code);
      setPostalCodeLoading(false);
      if (city) {
        onChange({ ...formState, postalCode: code, city });
        setPostalCodeNotFound(false);
      } else {
        setPostalCodeNotFound(true);
      }
    }, 600);

    return () => {
      if (postalDebounceRef.current) clearTimeout(postalDebounceRef.current);
    };
  }, [formState.postalCode]);

  /* ── Handlers ───────────────────────────────────────────────────────────── */
  const searchClientByDni = async () => {
    if (!formState.dni || formState.dni.length < 6) return;
    setDniSearchLoading(true);
    try {
      const result = await clientService.findByDni(formState.dni);
      if (result) {
        setClientExists(true);
        onChange({
          id: result.id,
          firstName: result.firstName || "",
          lastName: result.lastName || "",
          dni: result.dni || "",
          dniType: result.dniType || DniType.NIF,
          email: result.email || "",
          phoneNumber: result.phoneNumber || "",
          address: result.address || "",
          city: result.city || "",
          postalCode: result.postalCode || "",
          preferredContact: result.preferredContact || PreferredContact.PHONE,
          observations: result.observations || "",
        });
      } else {
        setClientExists(false);
      }
    } catch {
      setClientExists(false);
    } finally {
      setDniSearchLoading(false);
    }
  };

  const handleSearch = async (termOverride?: string) => {
    const term = (termOverride ?? searchTerm).trim();
    if (!term || term.length < 3) {
      if (!termOverride) {
        // Solo mostrar el toast cuando el usuario pulsa el botón manualmente
        showToast.error("Por favor ingrese al menos 3 caracteres para buscar", {
          duration: 5000,
          position: "top-right",
        });
      }
      return;
    }
    setLoading(true);
    try {
      const results = await clientService.searchClients(term);
      setSearchResults(results || []);
      setShowSearch(true);
    } catch {
      setSearchResults([]);
      showToast.error("Error al buscar clientes. Por favor intente de nuevo.", {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectClient = (client) => {
    onChange({
      id: client.id,
      firstName: client.firstName || "",
      lastName: client.lastName || "",
      dni: client.dni || "",
      dniType: client.dniType || DniType.NIF,
      email: client.email || "",
      phoneNumber: client.phoneNumber || "",
      address: client.address || "",
      city: client.city || "",
      postalCode: client.postalCode || "",
      preferredContact: client.preferredContact || PreferredContact.PHONE,
      observations: client.observations || "",
    });
    setShowSearch(false);
    setClientExists(true);
    setSearchTerm("");
  };

  const handleClientChange = (e) => {
    const { name, value } = e.target;
    onChange({ ...formState, [name]: value });
  };

  const handleContinue = (e) => {
    e.preventDefault();
    if (!formState.firstName) {
      showToast.error("Por favor complete los campos obligatorios (Nombre)", {
        duration: 5000,
        position: "top-right",
      });
      return;
    }
    onSubmit();
  };

  const resetForm = () => {
    onChange({});
    setClientExists(false);
    setSearchResults([]);
    setShowSearch(false);
    setSearchTerm("");
    setDniStatus(null);
    setPostalCodeNotFound(false);
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  /* ── DNI indicator ──────────────────────────────────────────────────────── */
  const dniIndicator = () => {
    if (formState.dniType === DniType.PASSPORT) return null;
    if (dniStatus === "valid") {
      return <span className={styles.dniValid}>✓ Documento válido</span>;
    }
    if (dniStatus === "invalid") {
      return (
        <span className={styles.dniInvalid}>
          ✗ Letra de control incorrecta — revisa el número
        </span>
      );
    }
    if (dniStatus === "format") {
      return (
        <span className={styles.dniInvalid}>
          ✗ Formato incorrecto (ej: 12345678Z para NIF, X1234567Z para NIE)
        </span>
      );
    }
    return null;
  };

  return (
    <div className={styles.formContainer}>
      <h2 className={styles.titleHeader}>Informacion Cliente</h2>

      {/* Buscador de clientes */}
      <div className={styles.searchContainer}>
        <div className={styles.searchInputGroup}>
          <input
            type="text"
            placeholder="Buscar cliente por nombre, email o teléfono"
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              // Pasamos el valor fresco para evitar leer el estado obsoleto del closure
              if (val.trim().length > 2) handleSearch(val);
            }}
            onKeyDown={handleSearchKeyPress}
            className={styles.searchInput}
          />
          <button
            type="button"
            onClick={handleSearch}
            className={styles.searchButton}
            disabled={loading || !searchTerm.trim()}
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {dniSearchLoading && (
          <div className={styles.dniSearchLoading}>
            <p>Verificando cliente por DNI...</p>
          </div>
        )}

        {clientExists && (
          <div className={styles.clientExistsAlert}>
            <p>
              <span className={styles.checkIcon}>✓</span>
              Cliente existente encontrado - Datos cargados automáticamente
            </p>
            <button type="button" onClick={resetForm} className={styles.resetButton}>
              Crear nuevo cliente
            </button>
          </div>
        )}

        {showSearch && searchResults.length > 0 && (
          <div className={styles.searchResults}>
            <h3>Resultados de búsqueda ({searchResults.length})</h3>
            <div className={styles.resultsList}>
              {searchResults.map((client) => (
                <div
                  key={client.id}
                  className={styles.resultItem}
                  onClick={() => selectClient(client)}
                >
                  <div className={styles.resultName}>
                    {client.firstName} {client.lastName}
                  </div>
                  <div className={styles.resultDetails}>
                    <span>{client.dni}</span>
                    {client.email && <span>📧 {client.email}</span>}
                    {client.phoneNumber && <span>📞 {client.phoneNumber}</span>}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowSearch(false)}
              className={styles.closeButton}
            >
              Cerrar resultados
            </button>
          </div>
        )}

        {showSearch && searchResults.length === 0 && !loading && (
          <div className={styles.noResults}>
            No se encontraron clientes con el criterio: &quot;{searchTerm}&quot;
          </div>
        )}
      </div>

      <form onSubmit={handleContinue}>
        {/* Datos personales */}
        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Datos personales</h3>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label htmlFor="firstName" className={styles.formLabel}>
                Nombre <span className={styles.requiredMark}>*</span>
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                required
                value={formState.firstName || ""}
                onChange={handleClientChange}
                className={styles.formInput}
                placeholder="Escriba el nombre"
              />
              <small className={styles.fieldHelper}>
                Digite el nombre del cliente
              </small>
            </div>

            <div className={styles.formField}>
              <label htmlFor="lastName" className={styles.formLabel}>
                Apellido
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                value={formState.lastName || ""}
                onChange={handleClientChange}
                className={styles.formInput}
                placeholder="Escriba el apellido"
              />
              <small className={styles.fieldHelper}>
                Digite el apellido del cliente
              </small>
            </div>

            <div className={styles.formFieldGroup}>
              <div className={styles.formField}>
                <label htmlFor="dniType" className={styles.formLabel}>
                  Tipo de documento
                </label>
                <select
                  id="dniType"
                  name="dniType"
                  value={formState.dniType || DniType.NIF}
                  onChange={handleClientChange}
                  className={styles.formSelect}
                >
                  <option value={DniType.NIF}>NIF</option>
                  <option value={DniType.NIE}>NIE</option>
                  <option value={DniType.PASSPORT}>Pasaporte</option>
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="dni" className={styles.formLabel}>
                  Documento
                  {dniSearchLoading && (
                    <span className={styles.loadingSpinner}> 🔄</span>
                  )}
                </label>
                <input
                  type="text"
                  id="dni"
                  name="dni"
                  value={formState.dni || ""}
                  onChange={handleClientChange}
                  className={`${styles.formInput} ${
                    dniStatus === "valid"
                      ? styles.inputValid
                      : dniStatus === "invalid" || dniStatus === "format"
                      ? styles.inputInvalid
                      : ""
                  }`}
                  placeholder={
                    (formState.dniType || DniType.NIF) === DniType.NIF
                      ? "Ej: 12345678Z"
                      : (formState.dniType) === DniType.NIE
                      ? "Ej: X1234567Z"
                      : "Número de pasaporte"
                  }
                  maxLength={20}
                />
                {dniIndicator() && (
                  <small className={styles.fieldHelper}>{dniIndicator()}</small>
                )}
                {!dniIndicator() && (
                  <small className={styles.fieldHelper}>
                    Se buscará automáticamente al escribir
                  </small>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Información de contacto */}
        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Información de contacto</h3>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label htmlFor="email" className={styles.formLabel}>
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formState.email || ""}
                onChange={handleClientChange}
                className={styles.formInput}
                placeholder="ejemplo@correo.com"
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="phoneNumber" className={styles.formLabel}>
                Teléfono
              </label>
              <input
                type="tel"
                id="phoneNumber"
                name="phoneNumber"
                value={formState.phoneNumber || ""}
                onChange={handleClientChange}
                className={styles.formInput}
                placeholder="Ej: 600123456"
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="preferredContact" className={styles.formLabel}>
                Método de contacto preferido
              </label>
              <select
                id="preferredContact"
                name="preferredContact"
                value={formState.preferredContact || PreferredContact.PHONE}
                onChange={handleClientChange}
                className={styles.formSelect}
              >
                <option value={PreferredContact.PHONE}>Teléfono</option>
                <option value={PreferredContact.EMAIL}>Email</option>
                <option value={PreferredContact.SMS}>SMS</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dirección */}
        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Dirección</h3>
          <div className={styles.formGrid}>
            <div className={`${styles.formField} ${styles.fullWidth}`}>
              <label htmlFor="address" className={styles.formLabel}>
                Dirección
              </label>
              <input
                type="text"
                id="address"
                name="address"
                value={formState.address || ""}
                onChange={handleClientChange}
                className={styles.formInput}
                placeholder="Calle, número, piso, etc."
              />
            </div>

            <div className={styles.formField}>
              <label htmlFor="postalCode" className={styles.formLabel}>
                Código Postal
              </label>
              <input
                type="text"
                id="postalCode"
                name="postalCode"
                value={formState.postalCode || ""}
                onChange={handleClientChange}
                className={styles.formInput}
                placeholder="Ej: 09500"
                maxLength={5}
              />
              {postalCodeLoading && (
                <small className={styles.postalCodeLoading}>
                  🔍 Buscando municipio...
                </small>
              )}
              {postalCodeNotFound && !postalCodeLoading && (
                <small className={styles.postalCodeError}>
                  No se encontró municipio para este código — puedes escribirlo manualmente
                </small>
              )}
            </div>

            <div className={styles.formField}>
              <label htmlFor="city" className={styles.formLabel}>
                Ciudad / Municipio
              </label>
              <input
                type="text"
                id="city"
                name="city"
                value={formState.city || ""}
                onChange={handleClientChange}
                className={`${styles.formInput} ${
                  postalCodeLoading ? styles.inputLoading : ""
                }`}
                placeholder={
                  postalCodeLoading
                    ? "Buscando..."
                    : "Se completa con el código postal"
                }
                readOnly={postalCodeLoading}
              />
            </div>
          </div>
        </div>

        {/* Observaciones */}
        <div className={styles.formSection}>
          <h3 className={styles.sectionTitle}>Observaciones</h3>
          <div className={styles.formGrid}>
            <div className={`${styles.formField} ${styles.fullWidth}`}>
              <label htmlFor="observations" className={styles.formLabel}>
                Observaciones
              </label>
              <textarea
                id="observations"
                name="observations"
                value={formState.observations || ""}
                onChange={handleClientChange}
                className={styles.formTextarea}
                placeholder="Información adicional o requisitos especiales"
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className={styles.formActionsContainer}>
          <Link className={styles.backButton} href={"/serviceOrders"}>
            Volver
          </Link>
          <button type="submit" className={styles.continueButton}>
            {clientExists ? "Continuar con cliente existente" : "Continuar"}
          </button>
        </div>
      </form>
    </div>
  );
}
