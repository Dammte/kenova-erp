"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Wrench,
  User,
  CreditCard,
  MessageSquare,
  Save,
  Trash2,
  Check,
  Plus,
  X,
} from "lucide-react";

export default function ServiceDetailsForm({
  formState,
  onChange,
  onSubmit,
  onBack,
}) {
  const [expandedSection, setExpandedSection] = useState("servicio");

  const [searchTerm, setSearchTerm] = useState("");
  const [servicesList, setServicesList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [quickServices, setQuickServices] = useState<Array<{ id: string; name: string; price: string | number; description?: string; estimatedTime?: string }>>([]);

  const [newService, setNewService] = useState({
    name: "",
    category: "",
    description: "",
    price: "",
    estimatedTime: "",
  });

  const serviceData = useMemo(() => {
    if (!formState) return {
      services: [],
      totalPrice: 0,
      amountPaid: 0,
      balance: 0,
      priority: "",
      assignedTo: "",
      paymentMethod: "",
      paymentStatus: "PENDING",
      observations: "",
      description: "",
    };
    return {
      services: formState.services || [],
      totalPrice: parseFloat(formState.totalPrice || "0"),
      amountPaid: parseFloat(formState.amountPaid || "0"),
      balance: parseFloat(formState.balance || "0"),
      priority: formState.priority || "",
      assignedTo: formState.assignedTo || "",
      paymentMethod: formState.paymentMethod || "",
      paymentStatus: formState.paymentStatus || "PENDING",
      observations: formState.observations || "",
      description: formState.description || "",
    };
  }, [formState]);

  const updateFormData = useCallback(
    (updates) => {
      onChange({
        ...formState,
        ...updates,
      });
    },
    [formState, onChange]
  );

  const updateField = useCallback(
    (field, value) => {
      updateFormData({ [field]: value });
    },
    [updateFormData]
  );

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? "" : section);
  };

  const handleSearchFocus = useCallback(() => {
    setShowServiceDropdown(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    setTimeout(() => setShowServiceDropdown(false), 200);
  }, []);

  const handleSearch = () => {
    if (searchTerm.length >= 3) {
      fetchServices();
    }
  };

  const selectService = (service) => {
    const currentServices = serviceData.services;

    if (!currentServices.find((s) => s.id === service.id)) {
      const updatedServices = [...currentServices, service];
      const newTotal = updatedServices.reduce(
        (sum, s) => sum + parseFloat(s.price || 0),
        0
      );

      updateFormData({
        services: updatedServices,
        totalPrice: newTotal.toFixed(2),
      });
    }

    setSearchTerm("");
    setShowServiceDropdown(false);
  };

  const removeSelectedService = (serviceId) => {
    const updatedServices = serviceData.services.filter(
      (s) => s.id !== serviceId
    );
    const newTotal = updatedServices.reduce(
      (sum, s) => sum + parseFloat(s.price || 0),
      0
    );

    updateFormData({
      services: updatedServices,
      totalPrice: newTotal.toFixed(2),
    });
  };

  const handleCreateNew = () => {
    setShowCreateForm(true);
    setShowServiceDropdown(false);
  };

  const handleCancelCreate = () => {
    setShowCreateForm(false);
    setNewService({
      name: "",
      category: "",
      description: "",
      price: "",
      estimatedTime: "",
    });
    setSearchTerm("");
  };

  const updateNewServiceField = (field, value) => {
    setNewService((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreateService = async () => {
    try {
      const response = await apiFetch(`${API_URL}/services`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newService),
      });

      if (response.ok) {
        const createdService = await response.json();
        selectService(createdService);
        handleCancelCreate();
      } else {
        console.error("Error al crear el servicio");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const filteredServices = servicesList.filter((service) =>
    service.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalSelectedPrice = useMemo(() => {
    return serviceData.services.reduce(
      (sum: number, service: { price?: string | number }) => sum + parseFloat(String(service.price || 0)),
      0
    );
  }, [serviceData.services]);

  const fetchServices = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/services/name/${encodeURIComponent(
          searchTerm
        )}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setServicesList(data);
    } catch (error) {
      console.error("Error fetching services:", error);
      setServicesList([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (searchTerm.length >= 3) {
      const timeoutId = setTimeout(() => {
        fetchServices();
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setServicesList([]);
    }
  }, [searchTerm]);

  // Load the default "Revisión" quick-pick service by name
  useEffect(() => {
    apiFetch(`${API_URL}/services/name/Revisi%C3%B3n`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setQuickServices(Array.isArray(data) && data.length > 0 ? [data[0]] : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const total = serviceData.totalPrice;
    const paid = serviceData.amountPaid;
    const balance = (total - paid).toFixed(2);

    let newPaymentStatus = "PENDING";
    if (total <= 0) {
      newPaymentStatus = "PENDING";
    } else if (paid <= 0) {
      newPaymentStatus = "PENDING";
    } else if (paid >= total) {
      newPaymentStatus = "PAID";
    } else if (paid > 0) {
      newPaymentStatus = "PARTIAL";
    }

    if (
      parseFloat(balance) !== serviceData.balance ||
      newPaymentStatus !== serviceData.paymentStatus
    ) {
      updateFormData({
        balance: balance,
        paymentStatus: newPaymentStatus,
      });
    }
  }, [serviceData.totalPrice, serviceData.amountPaid]);

  const handleContinue = (e) => {
    e.preventDefault();
    onSubmit();
  };

  const prioridades = [
    {
      value: "LOW",
      label: "Baja",
      description: "7-10 días hábiles",
      color: "#4ade80",
      icon: "🐢",
    },
    {
      value: "MEDIUM",
      label: "Normal",
      description: "3-5 días hábiles",
      color: "#60a5fa",
      icon: "🚶",
    },
    {
      value: "HIGH",
      label: "Alta",
      description: "1-2 días hábiles",
      color: "#f97316",
      icon: "🏃",
    },
    {
      value: "URGENT",
      label: "Urgente",
      description: "Mismo día/24h",
      color: "#ef4444",
      extra: true,
      icon: "🚀",
    },
  ];

  const paymentStatusOptions = [
    { value: "PENDING", label: "Pendiente", color: "#f59e0b" },
    { value: "PARTIAL", label: "Pago parcial", color: "#3b82f6" },
    { value: "PAID", label: "Pagado", color: "#10b981" },
  ];

  const paymentMethods = [
    { value: "CASH", label: "Efectivo", icon: "💶" },
    { value: "CARD", label: "Tarjeta", icon: "💳" },
    { value: "TRANSFER", label: "Transferencia", icon: "🏦" },
    { value: "OTHER", label: "Otro", icon: "📝" },
  ];

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-700 to-gray-900 text-white p-6">
        <div className="flex items-center mb-4">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors mr-3"
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="text-2xl font-bold">Detalles del Servicio Técnico</h2>
        </div>
        <p className="text-blue-100 ml-11">
          Complete los detalles del servicio requerido para continuar con el
          proceso
        </p>
      </div>

      <form onSubmit={handleContinue} className="p-6">
        <div className="space-y-8">
          {/* Información del Servicio */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div
              className="flex justify-between items-center px-6 py-4 cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
              onClick={() => toggleSection("servicio")}
            >
              <h3 className="flex items-center text-lg font-semibold text-gray-800">
                <Wrench size={20} className="mr-3 text-gray-600" />
                Información del Servicio
                <span className="ml-1 text-red-500">*</span>
              </h3>
              <div className="text-gray-500">
                {expandedSection === "servicio" ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </div>
            </div>

            {expandedSection === "servicio" && (
              <div className="p-6 space-y-6">
                {/* Barra de búsqueda mejorada */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Buscar servicios disponibles
                  </label>
                  <div className="flex gap-3">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="Buscar por nombre o descripción..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={handleSearchFocus}
                        onBlur={handleSearchBlur}
                        className="w-full p-3 pl-10 pr-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-gray-800 transition-all bg-white"
                      />
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                        <Search size={18} />
                      </div>
                      {isLoading && (
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-800"></div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleSearch}
                      disabled={isLoading || searchTerm.length < 3}
                      className="px-6 py-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      <Search size={18} />
                      Buscar
                    </button>
                  </div>

                  {/* Dropdown de servicios */}
                  {showServiceDropdown && (
                    <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-2xl max-h-96 overflow-y-auto">
                      {isLoading ? (
                        <div className="p-6 text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-800 mx-auto"></div>
                          <p className="mt-3 text-gray-600 text-sm">
                            Buscando servicios...
                          </p>
                        </div>
                      ) : searchTerm.length < 3 ? (
                        <div className="p-6 text-gray-500 text-center text-sm">
                          Escribe al menos 3 caracteres para buscar
                        </div>
                      ) : filteredServices.length > 0 ? (
                        <>
                          {filteredServices.map((service) => (
                            <div
                              key={service.id}
                              onClick={() => selectService(service)}
                              className="p-4 cursor-pointer hover:bg-gray-50 border-b border-gray-100 transition-colors group"
                            >
                              <div className="font-medium text-gray-900 group-hover:text-gray-800">
                                {service.name}
                              </div>
                              <div className="text-sm text-gray-600 mt-1 leading-relaxed">
                                {service.description}
                              </div>
                              <div className="flex justify-between items-center mt-3">
                                <span className="text-sm font-semibold text-gray-900">
                                  €{service.price}
                                </span>
                                <span className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                                  {service.estimatedTime}
                                </span>
                              </div>
                            </div>
                          ))}
                          {/* Opción para crear nuevo servicio en el dropdown */}
                          <div
                            onClick={handleCreateNew}
                            className="p-4 cursor-pointer hover:bg-gray-50 transition-colors border-t border-gray-200 bg-gray-25"
                          >
                            <div className="flex items-center gap-3 text-gray-700">
                              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                <Plus size={16} />
                              </div>
                              <div>
                                <div className="font-medium text-gray-900">
                                  ¿No encuentras lo que buscas?
                                </div>
                                <div className="text-sm text-gray-600">
                                  Crear nuevo servicio personalizado
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div
                          onClick={handleCreateNew}
                          className="p-8 cursor-pointer hover:bg-gray-50 transition-colors"
                        >
                          <div className="text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Plus size={24} className="text-gray-600" />
                            </div>
                            <div className="font-medium text-gray-900 mb-1">
                              No se encontraron servicios
                            </div>
                            <div className="text-sm text-gray-600 mb-4">
                              No hay servicios que coincidan con "{searchTerm}"
                            </div>
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors">
                              <Plus size={16} />
                              Crear servicio personalizado
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Estado vacío — sin servicios seleccionados y sin búsqueda activa */}
                {serviceData.services.length === 0 &&
                  !showServiceDropdown &&
                  !showCreateForm && (
                    <div className="py-8 px-6">
                      <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Wrench size={24} className="text-gray-500" />
                        </div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-2">
                          Selecciona los servicios necesarios
                        </h4>
                        <p className="text-gray-500 text-sm max-w-md mx-auto">
                          Busca en el catálogo o elige uno de los servicios
                          frecuentes de abajo
                        </p>
                      </div>

                      {/* Servicios frecuentes */}
                      {quickServices.length > 0 && (
                        <div className="mb-6">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                            Servicios frecuentes
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {quickServices.map((service) => {
                              const alreadyAdded = serviceData.services.some(
                                (s) => s.id === service.id
                              );
                              return (
                                <button
                                  key={service.id}
                                  type="button"
                                  disabled={alreadyAdded}
                                  onClick={() => selectService(service)}
                                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                                    alreadyAdded
                                      ? "border-green-300 bg-green-50 cursor-not-allowed opacity-70"
                                      : "border-gray-200 hover:border-gray-800 hover:bg-gray-50 hover:shadow-sm cursor-pointer"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="font-medium text-gray-900 text-sm leading-tight">
                                      {service.name}
                                    </span>
                                    {alreadyAdded && (
                                      <Check size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between mt-2">
                                    <span className="text-base font-bold text-gray-900">
                                      €{parseFloat(String(service.price)).toFixed(2)}
                                    </span>
                                    {service.estimatedTime && (
                                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                        {service.estimatedTime}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={handleCreateNew}
                          className="px-6 py-2.5 border border-gray-300 hover:border-gray-500 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
                        >
                          <Plus size={16} />
                          Crear servicio personalizado
                        </button>
                      </div>
                    </div>
                  )}

                {/* Servicios seleccionados */}
                {serviceData.services.length > 0 && !showCreateForm && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-3">
                        <div className="w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center">
                          <Check size={14} className="text-white" />
                        </div>
                        Servicios Seleccionados ({serviceData.services.length})
                      </h4>
                      <button
                        type="button"
                        onClick={handleCreateNew}
                        className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm border border-gray-300 hover:border-gray-400"
                      >
                        <Plus size={16} />
                        Agregar otro
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {serviceData.services.map((service) => (
                        <div
                          key={service.id}
                          className="bg-white rounded-lg p-5 border border-gray-200 hover:border-gray-300 transition-all hover:shadow-sm"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h5 className="font-medium text-gray-900 mb-2">
                                {service.name}
                              </h5>
                              <p className="text-sm text-gray-600 leading-relaxed mb-3">
                                {service.description?.substring(0, 80)}
                                {service.description?.length > 80 ? "..." : ""}
                              </p>
                              <div className="flex justify-between items-center">
                                <span className="text-lg font-semibold text-gray-900">
                                  €{service.price}
                                </span>
                                <span className="text-xs bg-gray-200 text-gray-700 px-3 py-1.5 rounded-full font-medium">
                                  {service.estimatedTime}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSelectedService(service.id)}
                              className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total */}
                    <div className="bg-white rounded-lg p-5 border-2 border-gray-300">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-gray-700">
                          Total estimado:
                        </span>
                        <span className="text-2xl font-bold text-gray-900">
                          €{totalSelectedPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Servicios frecuentes para añadir más */}
                    {quickServices.length > 0 && (
                      <div className="mt-5 pt-5 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                          Añadir servicio frecuente
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {quickServices.map((service) => {
                            const alreadyAdded = serviceData.services.some(
                              (s) => s.id === service.id
                            );
                            return (
                              <button
                                key={service.id}
                                type="button"
                                disabled={alreadyAdded}
                                onClick={() => selectService(service)}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                                  alreadyAdded
                                    ? "border-green-300 bg-green-50 text-green-700 cursor-not-allowed"
                                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-800 hover:bg-gray-50 cursor-pointer"
                                }`}
                              >
                                {alreadyAdded ? (
                                  <Check size={13} className="text-green-600" />
                                ) : (
                                  <Plus size={13} />
                                )}
                                {service.name}
                                <span className="text-gray-500 font-normal">
                                  €{parseFloat(String(service.price)).toFixed(2)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Acciones */}
                    <div className="flex gap-3 mt-6">
                      <button
                        type="button"
                        onClick={() => updateFormData({ services: [] })}
                        className="px-4 py-2 border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
                      >
                        <Trash2 size={16} />
                        Limpiar todo
                      </button>
                    </div>
                  </div>
                )}

                {/* Formulario para crear nuevo servicio */}
                {showCreateForm && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-3">
                        <div className="w-6 h-6 bg-gray-900 rounded-full flex items-center justify-center">
                          <Plus size={14} className="text-white" />
                        </div>
                        Crear Nuevo Servicio
                      </h4>
                      <button
                        type="button"
                        onClick={handleCancelCreate}
                        className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-white rounded-lg transition-colors text-sm border border-gray-300"
                      >
                        <ArrowLeft size={16} />
                        Cancelar
                      </button>
                    </div>

                    <div className="bg-white rounded-lg p-6 space-y-6 border border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">
                            Nombre del servicio{" "}
                            <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newService.name}
                            onChange={(e) =>
                              updateNewServiceField("name", e.target.value)
                            }
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-gray-800 transition-all bg-white"
                            placeholder="Ej: Reparación de iPhone 13"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">
                            Categoría
                          </label>
                          <input
                            type="text"
                            value={newService.category}
                            onChange={(e) =>
                              updateNewServiceField("category", e.target.value)
                            }
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-gray-800 transition-all bg-white"
                            placeholder="Ej: Smartphones / Laptops / Audio"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2">
                          Descripción detallada del problema{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          rows="4"
                          value={newService.description}
                          onChange={(e) =>
                            updateNewServiceField("description", e.target.value)
                          }
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-gray-800 transition-all resize-none bg-white"
                          placeholder="Describa detalladamente el problema que presenta el dispositivo..."
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">
                            Precio base (€)
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                              €
                            </span>
                            <input
                              type="number"
                              value={newService.price}
                              onChange={(e) =>
                                updateNewServiceField("price", e.target.value)
                              }
                              className="w-full p-3 pl-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-gray-800 transition-all bg-white"
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-900 mb-2">
                            Tiempo estimado
                          </label>
                          <input
                            type="text"
                            value={newService.estimatedTime}
                            onChange={(e) =>
                              updateNewServiceField(
                                "estimatedTime",
                                e.target.value
                              )
                            }
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-gray-800 transition-all bg-white"
                            placeholder="Ej: 1-2 días"
                          />
                        </div>
                      </div>

                      <div className="flex gap-4 pt-6 border-t border-gray-200">
                        <button
                          type="button"
                          onClick={handleCreateService}
                          className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors"
                        >
                          <Save size={18} />
                          Crear Servicio
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelCreate}
                          className="px-6 py-3 border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-800 hover:bg-gray-50 rounded-lg font-medium transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Prioridad y Asignación */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div
              className="flex justify-between items-center px-6 py-4 cursor-pointer bg-gray-50 hover:bg-gray-100/70 transition-colors border-b border-gray-200"
              onClick={() => toggleSection("prioridad")}
            >
              <h3 className="flex items-center text-lg font-semibold text-gray-800">
                <User size={20} className="mr-3 text-blue-600" />
                Prioridad y Asignación
                <span className="ml-1 text-red-500">*</span>
              </h3>
              <div className="text-gray-500">
                {expandedSection === "prioridad" ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </div>
            </div>

            {expandedSection === "prioridad" && (
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Seleccione la prioridad del servicio{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {prioridades.map((prioridad) => (
                      <div
                        key={prioridad.value}
                        onClick={() => updateField("priority", prioridad.value)}
                        className={`
                          cursor-pointer rounded-xl transition-all duration-200 overflow-hidden
                          ${
                            serviceData.priority === prioridad.value
                              ? "ring-2 shadow-md scale-[1.02]"
                              : "border border-gray-200 hover:border-gray-300 hover:shadow-sm"
                          }
                        `}
                        style={{
                          ringColor:
                            serviceData.priority === prioridad.value
                              ? prioridad.color
                              : "transparent",
                        }}
                      >
                        <input
                          type="radio"
                          name="prioridad"
                          value={prioridad.value}
                          checked={serviceData.priority === prioridad.value}
                          onChange={() => {}}
                          className="sr-only"
                        />

                        <div className="flex flex-col items-center p-4">
                          <div
                            className="w-12 h-12 flex items-center justify-center rounded-full mb-3"
                            style={{
                              backgroundColor: `${prioridad.color}20`,
                              color: prioridad.color,
                            }}
                          >
                            <span className="text-2xl">{prioridad.icon}</span>
                          </div>

                          <div className="text-center">
                            <p
                              className="font-medium"
                              style={{ color: prioridad.color }}
                            >
                              {prioridad.label}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {prioridad.description}
                            </p>

                            {prioridad.extra && (
                              <span className="inline-block mt-2 text-xs font-medium bg-red-100 text-red-800 py-1 px-2 rounded-full">
                                Cargo adicional
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Técnico asignado
                  </label>
                  <input
                    type="text"
                    name="assignedTo"
                    value={serviceData.assignedTo}
                    onChange={(e) => updateField("assignedTo", e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Nombre del técnico responsable"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Información de pago */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div
              className="flex justify-between items-center px-6 py-4 cursor-pointer bg-gray-50 hover:bg-gray-100/70 transition-colors border-b border-gray-200"
              onClick={() => toggleSection("pago")}
            >
              <h3 className="flex items-center text-lg font-semibold text-gray-800">
                <CreditCard size={20} className="mr-3 text-blue-600" />
                Información de Pago
              </h3>
              <div className="text-gray-500">
                {expandedSection === "pago" ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </div>
            </div>

            {expandedSection === "pago" && (
              <div className="p-6">
                <div className="bg-slate-50 p-5 rounded-lg mb-6 border border-slate-200">
                  <div className="flex flex-wrap md:flex-nowrap gap-4">
                    <div className="w-full md:w-1/3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Precio total (€)
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                          €
                        </span>
                        <input
                          type="number"
                          name="totalPrice"
                          value={serviceData.totalPrice || ""}
                          onChange={(e) =>
                            updateField("totalPrice", e.target.value)
                          }
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            if (!e.target.value) updateField("totalPrice", "0");
                          }}
                          className="w-full p-3 pl-8 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div className="w-full md:w-1/3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cantidad pagada (€)
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                          €
                        </span>
                        <input
                          type="number"
                          name="amountPaid"
                          value={serviceData.amountPaid || ""}
                          onChange={(e) =>
                            updateField("amountPaid", e.target.value)
                          }
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => {
                            if (!e.target.value) updateField("amountPaid", "0");
                          }}
                          className="w-full p-3 pl-8 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div className="w-full md:w-1/3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Saldo pendiente (€)
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                          €
                        </span>
                        <input
                          type="number"
                          name="balance"
                          // value={formState.servicio.balance}
                          value={serviceData.balance || "0.00"}
                          className="w-full p-3 pl-8 border border-gray-300 rounded-lg bg-white/50 text-gray-700 font-medium"
                          readOnly
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">
                        Estado del pago:
                      </span>
                      <div className="flex gap-2">
                        {paymentStatusOptions.map((option) => (
                          <span
                            key={option.value}
                            className={`
                              px-3 py-1 rounded-full text-xs font-medium 
                              ${
                                // formState.servicio.paymentStatus ===
                                serviceData.paymentStatus === option.value
                                  ? "bg-opacity-100 text-white"
                                  : "bg-opacity-15 text-opacity-90"
                              }
                            `}
                            style={{
                              backgroundColor:
                                // formState.servicio.paymentStatus ===
                                serviceData.paymentStatus === option.value
                                  ? option.color
                                  : `${option.color}20`,
                              color:
                                // formState.servicio.paymentStatus ===
                                serviceData.paymentStatus === option.value
                                  ? "white"
                                  : option.color,
                            }}
                          >
                            {option.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Método de pago
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {paymentMethods.map((method) => (
                      <div
                        key={method.value}
                        onClick={() =>
                          updateField("paymentMethod", method.value)
                        }
                        className={`
                          flex flex-col items-center justify-center p-3 rounded-lg cursor-pointer transition-all
                          ${
                            // formState.servicio.paymentMethod === method.value
                            serviceData.paymentMethod === method.value
                              ? "bg-blue-50 border-2 border-blue-500"
                              : "border border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }
                        `}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method.value}
                          checked={
                            // formState.servicio.paymentMethod === method.value
                            serviceData.paymentMethod === method.value
                          }
                          onChange={() => {}}
                          className="sr-only"
                        />
                        <span className="text-2xl mb-1">{method.icon}</span>
                        <span className="text-sm font-medium text-gray-800">
                          {method.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Observaciones adicionales */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div
              className="flex justify-between items-center px-6 py-4 cursor-pointer bg-gray-50 hover:bg-gray-100/70 transition-colors border-b border-gray-200"
              onClick={() => toggleSection("observaciones")}
            >
              <h3 className="flex items-center text-lg font-semibold text-gray-800">
                <MessageSquare size={20} className="mr-3 text-blue-600" />
                Observaciones Adicionales
              </h3>
              <div className="text-gray-500">
                {expandedSection === "observaciones" ? (
                  <ChevronUp size={20} />
                ) : (
                  <ChevronDown size={20} />
                )}
              </div>
            </div>

            {expandedSection === "observaciones" && (
              <div className="p-6">
                <textarea
                  name="observaciones"
                  rows="4"
                  // value={formState.servicio.observations || ""}
                  value={serviceData.observations || ""}
                  onChange={(e) => updateField("observations", e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Información adicional relevante para el servicio técnico..."
                ></textarea>
              </div>
            )}
          </div>
        </div>

        {/* Footer y botones de acción */}
        <div className="flex flex-wrap md:flex-nowrap justify-between items-center mt-10 gap-4">
          <button
            type="button"
            onClick={onBack}
            className="w-full md:w-auto px-5 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors flex items-center justify-center"
          >
            <ArrowLeft size={18} className="mr-2" /> Volver
          </button>

          <button
            type="submit"
            className="w-full md:w-auto px-8 py-3 bg-blue-600 rounded-lg text-white font-medium hover:bg-blue-700 transition-colors flex items-center justify-center"
          >
            Continuar
          </button>
        </div>
      </form>
    </div>
  );
}
