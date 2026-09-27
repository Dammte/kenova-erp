"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, useEffect } from "react";
import {
  Smartphone,
  Laptop,
  Loader2,
  PlusCircle,
  ArrowLeft,
  Search,
  AlertCircle,
  Info,
} from "lucide-react";

export default function ExistingDeviceSelector({
  clientId,
  onSelect,
  onNewDevice,
  onBack,
}) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredDevices, setFilteredDevices] = useState([]);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoading(true);
        const response = await apiFetch(`${API_URL}/devices/client/${clientId}`);
        const data = await response.json();
        setDevices(data);
        setFilteredDevices(data);
      } catch (error) {
        console.error("Error fetching devices:", error);
        setError(
          "No pudimos cargar los dispositivos. Por favor intenta nuevamente.",
        );
      } finally {
        setLoading(false);
      }
    };

    if (clientId) {
      fetchDevices();
    }
  }, [clientId]);

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredDevices(devices);
    } else {
      const filtered = devices.filter(
        (device) =>
          device.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
          device.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (device.imei &&
            device.imei.toLowerCase().includes(searchTerm.toLowerCase())) ||
          device.type.toLowerCase().includes(searchTerm.toLowerCase()),
      );
      setFilteredDevices(filtered);
    }
  }, [searchTerm, devices]);

  const getDeviceTypeIcon = (type) => {
    switch (type.toLowerCase()) {
      case "smartphone":
      case "celular":
      case "móvil":
      case "teléfono":
        return <Smartphone className="w-6 h-6" />;
      case "laptop":
      case "notebook":
      case "computadora":
      case "ordenador":
        return <Laptop className="w-6 h-6" />;
      default:
        return <Smartphone className="w-6 h-6" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 bg-white rounded-lg">
      {/* Header con botón de retroceso */}
      <div className="flex items-center border-b border-gray-200 pb-4 mb-6">
        <button
          onClick={onBack}
          className="flex items-center text-gray-700 hover:text-blue-600 transition-colors mr-4"
        >
          <ArrowLeft className="w-5 h-5 mr-1" />
        </button>
        <h2 className="text-xl font-semibold text-gray-800">
          Seleccionar Dispositivo
        </h2>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600">Cargando dispositivos...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start">
          <AlertCircle className="w-6 h-6 text-red-500 mr-3 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      ) : (
        <>
          {/* Barra de búsqueda */}
          <div className="relative mb-6">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Buscar por marca, modelo o IMEI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Grid de dispositivos */}
          {filteredDevices.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {filteredDevices.map((device) => (
                <button
                  key={device.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-blue-300 transition-all duration-200 flex items-start text-left"
                  onClick={() => onSelect(device)}
                >
                  <div className="bg-blue-100 p-3 rounded-full mr-4 flex-shrink-0">
                    {getDeviceTypeIcon(device.type)}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">
                      {device.brand.name} {device.model}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      <span className="font-medium">IMEI/SN:</span>{" "}
                      {device.imei || "No registrado"}
                    </p>
                    <p className="text-sm text-gray-500">
                      <span className="font-medium">Tipo:</span> {device.type}
                    </p>
                    <div className="mt-2">
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                        Seleccionar
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              <Info className="w-12 h-12 text-gray-400 mb-3" />
              <p className="text-gray-600 mb-2">
                No hay dispositivos que coincidan con tu búsqueda.
              </p>
              {searchTerm ? (
                <button
                  onClick={() => setSearchTerm("")}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Mostrar todos los dispositivos
                </button>
              ) : (
                <p className="text-gray-500 text-sm">
                  Registra un nuevo dispositivo para este cliente.
                </p>
              )}
            </div>
          )}

          {/* Botón para registrar nuevo dispositivo */}
          <div className="mt-6">
            <button
              onClick={onNewDevice}
              className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              Registrar nuevo dispositivo
            </button>
          </div>
        </>
      )}
    </div>
  );
}
