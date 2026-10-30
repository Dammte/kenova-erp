"use client";

/**
 * Alta rápida: cliente, dispositivo y servicios en una sola pantalla.
 * Convive con el asistente por pasos (/serviceOrders/newServiceOrder) mientras
 * se valida; envía todo a POST /service-orders/intake, que lo crea en una
 * única transacción.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { showToast } from "nextjs-toast-notify";
import { ArrowLeft, Check, Printer, Search, X } from "lucide-react";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import PatternLock from "@/components/serviceOrders/PatternLock";
import { printOrderTicket } from "../utils/print";
import type { ServiceOrder } from "../types";
import styles from "./page.module.css";

// ── Opciones (mismos valores que guarda el asistente por pasos) ─────────────
const DEVICE_TYPES = [
  { value: "movil", label: "Móvil" },
  { value: "tablet", label: "Tablet" },
  { value: "computador", label: "Ordenador" },
  { value: "otro", label: "Otro" },
];

const CONDITIONS = [
  { value: "broken_screen", label: "Pantalla rota" },
  { value: "battery", label: "Batería" },
  { value: "not_turning_on", label: "No enciende" },
  { value: "liquid_damage", label: "Daño por líquido" },
  { value: "connectivity", label: "Conectividad / carga" },
  { value: "slow_performance", label: "Lento" },
  { value: "partial", label: "Funciona parcialmente" },
  { value: "working", label: "Funciona bien" },
  { value: "other", label: "Otro" },
];

const PRIORITIES = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "other", label: "Otro" },
];

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
/** Minúsculas y sin tildes: "batería" y "bateria" encuentran lo mismo. */
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// ── Tipos de la API ─────────────────────────────────────────────────────────
interface ClientHit {
  id: string;
  firstName: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  dni?: string;
}
interface DeviceHit {
  id: string;
  type: string;
  brand: string;
  model: string;
  imei?: string;
}
interface CatalogService {
  id: string;
  name: string;
  price: number | string;
  available?: boolean;
}
interface Brand {
  id: string;
  name: string;
}
interface Model {
  id: string;
  name: string;
  brandId?: string;
}

type Unlock = "none" | "code" | "pattern";

const emptyClient = { firstName: "", lastName: "", phoneNumber: "", email: "", dniType: "NIF", dni: "" };
const emptyDevice = { type: "movil", brand: "", model: "", imei: "", inventoryCode: "", status: "", observations: "" };

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await apiFetch(url);
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function IntakePage() {
  const router = useRouter();

  // Catálogos
  const [services, setServices] = useState<CatalogService[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [models, setModels] = useState<Model[]>([]);

  // Cliente
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [client, setClient] = useState<ClientHit | null>(null);
  const [newClient, setNewClient] = useState(emptyClient);

  // Dispositivo
  const [clientDevices, setClientDevices] = useState<DeviceHit[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [device, setDevice] = useState(emptyDevice);
  const [unlock, setUnlock] = useState<Unlock>("none");
  const [code, setCode] = useState("");
  const [pattern, setPattern] = useState("");

  // Orden
  const [serviceQuery, setServiceQuery] = useState("");
  const [selected, setSelected] = useState<CatalogService[]>([]);
  const [total, setTotal] = useState<string | null>(null); // null = suma de servicios
  const [paid, setPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [priority, setPriority] = useState("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [observations, setObservations] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<ServiceOrder | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getJson<CatalogService[]>(`${API_URL}/services`, []).then((s) =>
      setServices(s.filter((x) => x.available !== false)),
    );
    getJson<Brand[]>(`${API_URL}/brands`, []).then(setBrands);
    getJson<Model[]>(`${API_URL}/models`, []).then(setModels);
  }, []);

  // Búsqueda de clientes con espera de 300 ms
  useEffect(() => {
    const term = query.trim();
    if (client || term.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      setHits(await getJson<ClientHit[]>(`${API_URL}/clients/search?q=${encodeURIComponent(term)}`, []));
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, client]);

  const pickClient = async (c: ClientHit) => {
    setClient(c);
    setHits([]);
    const devices = await getJson<DeviceHit[]>(`${API_URL}/devices/client/${c.id}`, []);
    setClientDevices(devices);
    setDeviceId(null);
  };

  const clearClient = () => {
    setClient(null);
    setClientDevices([]);
    setDeviceId(null);
    setQuery("");
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  /** Lo escrito en el buscador pasa al formulario de cliente nuevo. */
  const startNewClient = () => {
    const term = query.trim();
    const isPhone = /^[+\d][\d\s]{5,}$/.test(term);
    const [first, ...rest] = term.split(/\s+/);
    setNewClient({
      ...emptyClient,
      phoneNumber: isPhone ? term : "",
      firstName: isPhone ? "" : first ?? "",
      lastName: isPhone ? "" : rest.join(" "),
    });
    setQuery("");
  };

  // Marcas y modelos sugeridos
  const brandMatch = brands.find((b) => b.name.toLowerCase() === device.brand.trim().toLowerCase());
  const modelOptions = useMemo(
    () => (brandMatch ? models.filter((m) => m.brandId === brandMatch.id) : models),
    [brandMatch, models],
  );

  // Servicios
  const servicesTotal = selected.reduce((sum, s) => sum + Number(s.price), 0);
  const totalNumber = total === null ? servicesTotal : Number(total.replace(",", ".")) || 0;
  const paidNumber = Number(paid.replace(",", ".")) || 0;
  const balance = Math.max(totalNumber - paidNumber, 0);

  const serviceResults = useMemo(() => {
    const words = fold(serviceQuery).split(/\s+/).filter(Boolean);
    const pool = services.filter((s) => !selected.some((x) => x.id === s.id));
    return pool.filter((s) => words.every((w) => fold(s.name).includes(w))).slice(0, 8);
  }, [serviceQuery, services, selected]);

  const addService = (s: CatalogService) => {
    setSelected((prev) => [...prev, s]);
    setServiceQuery("");
  };

  // Validación: lo mínimo para poder recibir el equipo
  const missing: string[] = [];
  if (!client) {
    if (!newClient.firstName.trim()) missing.push("nombre del cliente");
    if (!newClient.phoneNumber.trim()) missing.push("teléfono");
  }
  if (!deviceId) {
    if (!device.brand.trim()) missing.push("marca");
    if (!device.model.trim()) missing.push("modelo");
    if (!device.status) missing.push("avería");
  }
  if (paidNumber > totalNumber) missing.push("el pago no puede superar el total");

  const submit = useCallback(async () => {
    if (missing.length > 0 || submitting) return;
    setSubmitting(true);
    const body = {
      ...(client
        ? { clientId: client.id }
        : {
            client: {
              ...newClient,
              dni: newClient.dni.trim() || null,
              email: newClient.email.trim() || null,
              preferredContact: "PHONE",
            },
          }),
      ...(deviceId
        ? { deviceId }
        : {
            device: {
              ...device,
              imei: device.imei.trim() || null,
              inventoryCode: device.inventoryCode.trim() || null,
              code: unlock === "code" ? code : undefined,
              pattern: unlock === "pattern" ? pattern : undefined,
            },
          }),
      order: {
        serviceIds: selected.map((s) => s.id),
        totalPrice: Number(totalNumber.toFixed(2)),
        amountPaid: Number(paidNumber.toFixed(2)),
        paymentMethod: paidNumber > 0 ? paymentMethod : undefined,
        priority,
        status: "pendiente_cliente",
        assignedTo: assignedTo.trim() || undefined,
        observations: observations.trim() || undefined,
      },
    };
    try {
      const res = await apiFetch(`${API_URL}/service-orders/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "No se pudo crear la orden"));
      const order = (await res.json()) as ServiceOrder;
      setCreated(order);
      showToast.success("Orden creada", { duration: 4000, position: "top-right" });
      if (!deviceId) void addToCatalog(device.brand.trim(), device.model.trim());
    } catch (e) {
      showToast.error(e instanceof Error ? e.message : "No se pudo crear la orden", {
        duration: 6000,
        position: "top-right",
      });
    } finally {
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing.length, submitting, client, newClient, deviceId, device, unlock, code, pattern, selected, totalNumber, paidNumber, paymentMethod, priority, assignedTo, observations]);

  /** Marca y modelo nuevos se añaden al catálogo para que aparezcan como sugerencia. */
  const addToCatalog = async (brandName: string, modelName: string) => {
    try {
      let brand = brands.find((b) => b.name.toLowerCase() === brandName.toLowerCase());
      if (!brand) {
        const res = await apiFetch(`${API_URL}/brands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: brandName }),
        });
        if (!res.ok) return;
        brand = (await res.json()) as Brand;
      }
      const exists = models.some(
        (m) => m.brandId === brand!.id && m.name.toLowerCase() === modelName.toLowerCase(),
      );
      if (!exists) {
        await apiFetch(`${API_URL}/models`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: modelName, brandId: brand.id }),
        });
      }
    } catch {
      // El catálogo es solo una ayuda: la orden ya está creada.
    }
  };

  // Ctrl/Cmd + Enter crea la orden desde cualquier campo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  const resetAll = () => {
    setCreated(null);
    clearClient();
    setNewClient(emptyClient);
    setDevice(emptyDevice);
    setUnlock("none");
    setCode("");
    setPattern("");
    setSelected([]);
    setTotal(null);
    setPaid("");
    setPriority("medium");
    setAssignedTo("");
    setObservations("");
  };

  // ── Pantalla de confirmación ──────────────────────────────────────────────
  if (created) {
    return (
      <div className={styles.page}>
        <div className={styles.done}>
          <div className={styles.doneIcon}>
            <Check size={28} />
          </div>
          <h1>Orden creada</h1>
          <p>
            {created.client.firstName} {created.client.lastName} ·{" "}
            {created.device ? `${created.device.brand} ${created.device.model}` : ""} ·{" "}
            {eur.format(Number(created.totalPrice ?? 0))}
          </p>
          <div className={styles.doneActions}>
            <button className={styles.primary} onClick={() => printOrderTicket(created)}>
              <Printer size={16} /> Imprimir resguardo
            </button>
            <button className={styles.secondary} onClick={() => router.push(`/serviceOrders/${created.id}`)}>
              Ver orden
            </button>
            <button className={styles.secondary} onClick={resetAll}>
              Nueva alta
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Formulario ────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/serviceOrders" className={styles.back}>
          <ArrowLeft size={16} /> Órdenes
        </Link>
        <h1>Alta rápida</h1>
        <Link href="/serviceOrders/newServiceOrder" className={styles.altLink}>
          Usar el asistente por pasos
        </Link>
      </header>

      <div className={styles.grid}>
        <div className={styles.column}>
          {/* ── Cliente ── */}
          <section className={styles.card}>
            <h2>Cliente</h2>
            {client ? (
              <div className={styles.picked}>
                <div>
                  <strong>
                    {client.firstName} {client.lastName}
                  </strong>
                  <span>{[client.phoneNumber, client.email, client.dni].filter(Boolean).join(" · ")}</span>
                </div>
                <button className={styles.iconButton} onClick={clearClient} aria-label="Cambiar cliente">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <>
                <div className={styles.searchBox}>
                  <Search size={16} />
                  <input
                    ref={searchRef}
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nombre, teléfono, email o DNI"
                  />
                </div>
                {query.trim().length >= 2 && (
                  <ul className={styles.hits}>
                    {searching && <li className={styles.muted}>Buscando…</li>}
                    {!searching &&
                      hits.map((c) => (
                        <li key={c.id}>
                          <button onClick={() => pickClient(c)}>
                            <strong>
                              {c.firstName} {c.lastName}
                            </strong>
                            <span>{[c.phoneNumber, c.dni].filter(Boolean).join(" · ")}</span>
                          </button>
                        </li>
                      ))}
                    {!searching && (
                      <li>
                        <button className={styles.newHit} onClick={startNewClient}>
                          + Cliente nuevo{hits.length === 0 ? ` con "${query.trim()}"` : ""}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
                <div className={styles.fields}>
                  <label>
                    Nombre *
                    <input
                      value={newClient.firstName}
                      onChange={(e) => setNewClient({ ...newClient, firstName: e.target.value })}
                    />
                  </label>
                  <label>
                    Apellidos
                    <input
                      value={newClient.lastName}
                      onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })}
                    />
                  </label>
                  <label>
                    Teléfono *
                    <input
                      type="tel"
                      inputMode="tel"
                      value={newClient.phoneNumber}
                      onChange={(e) => setNewClient({ ...newClient, phoneNumber: e.target.value })}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                    />
                  </label>
                  <label>
                    Documento
                    <div className={styles.inline}>
                      <select
                        value={newClient.dniType}
                        onChange={(e) => setNewClient({ ...newClient, dniType: e.target.value })}
                      >
                        <option value="NIF">NIF</option>
                        <option value="NIE">NIE</option>
                        <option value="PASSPORT">Pasaporte</option>
                      </select>
                      <input
                        value={newClient.dni}
                        onChange={(e) => setNewClient({ ...newClient, dni: e.target.value })}
                      />
                    </div>
                  </label>
                </div>
              </>
            )}
          </section>

          {/* ── Dispositivo ── */}
          <section className={styles.card}>
            <h2>Dispositivo</h2>
            {clientDevices.length > 0 && (
              <div className={styles.chips}>
                {clientDevices.map((d) => (
                  <button
                    key={d.id}
                    className={deviceId === d.id ? styles.chipOn : styles.chip}
                    onClick={() => setDeviceId(deviceId === d.id ? null : d.id)}
                  >
                    {d.brand} {d.model}
                  </button>
                ))}
                <button
                  className={deviceId === null ? styles.chipOn : styles.chip}
                  onClick={() => setDeviceId(null)}
                >
                  Otro dispositivo
                </button>
              </div>
            )}

            {!deviceId && (
              <>
                <div className={styles.chips}>
                  {DEVICE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      className={device.type === t.value ? styles.chipOn : styles.chip}
                      onClick={() => setDevice({ ...device, type: t.value })}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className={styles.fields}>
                  <label>
                    Marca *
                    <input
                      list="intake-brands"
                      value={device.brand}
                      onChange={(e) => setDevice({ ...device, brand: e.target.value })}
                    />
                    <datalist id="intake-brands">
                      {brands.map((b) => (
                        <option key={b.id} value={b.name} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    Modelo *
                    <input
                      list="intake-models"
                      value={device.model}
                      onChange={(e) => setDevice({ ...device, model: e.target.value })}
                    />
                    <datalist id="intake-models">
                      {modelOptions.map((m) => (
                        <option key={m.id} value={m.name} />
                      ))}
                    </datalist>
                  </label>
                  <label>
                    IMEI / Nº de serie
                    <input value={device.imei} onChange={(e) => setDevice({ ...device, imei: e.target.value })} />
                  </label>
                  <label>
                    Código de inventario
                    <input
                      value={device.inventoryCode}
                      onChange={(e) => setDevice({ ...device, inventoryCode: e.target.value })}
                    />
                  </label>
                </div>

                <p className={styles.label}>Avería *</p>
                <div className={styles.chips}>
                  {CONDITIONS.map((c) => (
                    <button
                      key={c.value}
                      className={device.status === c.value ? styles.chipOn : styles.chip}
                      onClick={() => setDevice({ ...device, status: c.value })}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <p className={styles.label}>Desbloqueo</p>
                <div className={styles.chips}>
                  {(
                    [
                      ["none", "Sin código"],
                      ["code", "PIN / contraseña"],
                      ["pattern", "Patrón"],
                    ] as [Unlock, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      className={unlock === value ? styles.chipOn : styles.chip}
                      onClick={() => setUnlock(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {unlock === "code" && (
                  <input
                    className={styles.wide}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="PIN o contraseña (se guarda cifrado)"
                    autoComplete="off"
                  />
                )}
                {unlock === "pattern" && (
                  <div className={styles.pattern}>
                    <PatternLock value={pattern} onChange={setPattern} />
                  </div>
                )}

                <label className={styles.block}>
                  Estado físico y accesorios
                  <textarea
                    rows={2}
                    value={device.observations}
                    onChange={(e) => setDevice({ ...device, observations: e.target.value })}
                    placeholder="Ej.: arañazo en la tapa, entrega con funda y cargador"
                  />
                </label>
              </>
            )}
          </section>
        </div>

        <div className={styles.column}>
          {/* ── Servicios y pago ── */}
          <section className={styles.card}>
            <h2>Servicios</h2>
            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                value={serviceQuery}
                onChange={(e) => setServiceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && serviceResults[0]) {
                    e.preventDefault();
                    addService(serviceResults[0]);
                  }
                }}
                placeholder="Buscar servicio (Enter añade el primero)"
              />
            </div>
            <div className={styles.chips}>
              {serviceResults.map((s) => (
                <button key={s.id} className={styles.chip} onClick={() => addService(s)}>
                  {s.name} · {eur.format(Number(s.price))}
                </button>
              ))}
              {serviceResults.length === 0 && <span className={styles.muted}>Sin resultados</span>}
            </div>
            {selected.length > 0 && (
              <ul className={styles.lines}>
                {selected.map((s) => (
                  <li key={s.id}>
                    <span>{s.name}</span>
                    <span>{eur.format(Number(s.price))}</span>
                    <button
                      className={styles.iconButton}
                      onClick={() => setSelected(selected.filter((x) => x.id !== s.id))}
                      aria-label={`Quitar ${s.name}`}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className={styles.fields}>
              <label>
                Total (€)
                <input
                  inputMode="decimal"
                  value={total ?? servicesTotal.toFixed(2)}
                  onChange={(e) => setTotal(e.target.value)}
                  onBlur={() => total !== null && total.trim() === "" && setTotal(null)}
                />
              </label>
              <label>
                A cuenta (€)
                <input
                  inputMode="decimal"
                  value={paid}
                  placeholder="0,00"
                  onChange={(e) => setPaid(e.target.value)}
                />
              </label>
              {paidNumber > 0 && (
                <label>
                  Forma de pago
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Técnico
                <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
              </label>
            </div>

            <p className={styles.label}>Prioridad</p>
            <div className={styles.chips}>
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  className={priority === p.value ? styles.chipOn : styles.chip}
                  onClick={() => setPriority(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className={styles.block}>
              Observaciones de la orden
              <textarea rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} />
            </label>
          </section>

          {/* ── Resumen fijo ── */}
          <section className={`${styles.card} ${styles.summary}`}>
            <div className={styles.totals}>
              <span>Total</span>
              <strong>{eur.format(totalNumber)}</strong>
              <span>A cuenta</span>
              <strong>{eur.format(paidNumber)}</strong>
              <span>Pendiente</span>
              <strong>{eur.format(balance)}</strong>
            </div>
            {missing.length > 0 && <p className={styles.missing}>Falta: {missing.join(", ")}</p>}
            <button className={styles.primary} disabled={missing.length > 0 || submitting} onClick={submit}>
              {submitting ? "Creando…" : "Crear orden"}
            </button>
            <p className={styles.hint}>Ctrl + Enter</p>
          </section>
        </div>
      </div>
    </div>
  );
}
