"use client";

import React, { useState } from "react";
import { showToast } from "nextjs-toast-notify";
import {
  Smartphone,
  Tablet,
  Monitor,
  CheckCircle,
  AlertTriangle,
  BatteryCharging,
  Droplets,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Lock,
} from "lucide-react";
import PatternLock from "../../PatternLock";

interface Device {
  id?: string;
  deviceType: string;
  brand: string;
  model: string;
  imei?: string;
  inventoryCode?: string;
  status: string;
  observations?: string;
  code: string;
  pattern: string;
  clientId?: string;
}

interface ClientDevice {
  id: string;
  deviceType: string;
  brand: string;
  model: string;
  imei?: string;
  inventoryCode?: string;
}

interface DeviceDetailsFormProps {
  formState: Device;
  onChange: (update: Partial<Device>) => void;
  onSubmit: () => void;
  onBack: () => void;
  clientDevices?: ClientDevice[];
}

// PatternLock se importa desde el componente compartido ↑

function UnlockMethodTabs({
  activeTab,
  onChange,
}: {
  activeTab: string;
  onChange: (tab: string) => void;
}) {
  const tabStyle = (id: string): React.CSSProperties => {
    const active = activeTab === id;
    return {
      flex: 1,
      padding: "8px 16px",
      fontSize: 13,
      fontWeight: active ? 600 : 500,
      color: active ? "#4f6ef7" : "#64748b",
      background: active ? "#eef1fe" : "transparent",
      border: "none",
      borderBottom: active ? "2.5px solid #4f6ef7" : "2.5px solid transparent",
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "all 0.15s",
      borderRadius: active ? "6px 6px 0 0" : "0",
    };
  };

  return (
    <div style={{ display: "flex", borderBottom: "1.5px solid #e2e8f0", marginBottom: 16 }}>
      <button type="button" style={tabStyle("code")} onClick={() => onChange("code")}>
        Código PIN
      </button>
      <button type="button" style={tabStyle("pattern")} onClick={() => onChange("pattern")}>
        Patrón gráfico
      </button>
    </div>
  );
}

export default function DeviceDetailsForm({
  formState,
  onChange,
  onSubmit,
  onBack,
  clientDevices = [],
}: DeviceDetailsFormProps) {
  const [selectedExistingDevice, setSelectedExistingDevice] = useState<
    string | null
  >(null);
  const [unlockMethod, setUnlockMethod] = useState<string>("code");

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    const hasCode = formState.code?.trim();
    const hasPattern = formState.pattern?.trim();
    if (!hasCode && !hasPattern) {
      showToast.warning(
        "Recuerda solicitar al cliente el código PIN o patrón de desbloqueo antes de continuar",
        { duration: 6000, progress: true, position: "top-right", transition: "fadeIn" }
      );
    }
    onSubmit();
  };

  const handleSelectStatus = (value: string) => {
    onChange({ status: value });
  };

  const handleSelectExistingDevice = (deviceId: string) => {
    setSelectedExistingDevice(deviceId);
    const device = clientDevices.find((d) => d.id === deviceId);
    if (device) {
      onChange({
        id: device.id,
        deviceType: device.deviceType,
        brand: device.brand,
        model: device.model,
        imei: device.imei,
        inventoryCode: device.inventoryCode,
        status: "",
        observations: "",
        code: "",
        pattern: "",
      });
    }
  };

  const deviceStatuses = [
    {
      value: "working",
      label: "Funciona correctamente",
      icon: <CheckCircle className="w-5 h-5" />,
      iconColor: "text-emerald-600",
    },
    {
      value: "partial",
      label: "Funciona parcialmente",
      icon: <AlertTriangle className="w-5 h-5" />,
      iconColor: "text-amber-600",
    },
    {
      value: "not_turning_on",
      label: "No enciende",
      icon: <X className="w-5 h-5" />,
      iconColor: "text-red-600",
    },
    {
      value: "broken_screen",
      label: "Pantalla rota/dañada",
      icon: <Monitor className="w-5 h-5" />,
      iconColor: "text-purple-600",
    },
    {
      value: "liquid_damage",
      label: "Daño por líquido",
      icon: <Droplets className="w-5 h-5" />,
      iconColor: "text-blue-600",
    },
    {
      value: "battery",
      label: "Problemas de batería",
      icon: <BatteryCharging className="w-5 h-5" />,
      iconColor: "text-orange-600",
    },
    {
      value: "connectivity",
      label: "Problemas de conectividad",
      icon: <Smartphone className="w-5 h-5" />,
      iconColor: "text-indigo-600",
    },
    {
      value: "slow_performance",
      label: "Rendimiento lento",
      icon: <Tablet className="w-5 h-5" />,
      iconColor: "text-pink-600",
    },
    {
      value: "other",
      label: "Otro (especificar)",
      icon: <AlertCircle className="w-5 h-5" />,
      iconColor: "text-gray-600",
    },
  ];

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case "mobile":
        return <Smartphone className="w-5 h-5" />;
      case "tablet":
        return <Tablet className="w-5 h-5" />;
      case "computer":
        return <Monitor className="w-5 h-5" />;
      default:
        return <Smartphone className="w-5 h-5" />;
    }
  };

  const getDeviceName = (deviceType: string) => {
    switch (deviceType) {
      case "mobile":
        return "Móvil";
      case "tablet":
        return "Tableta";
      case "computer":
        return "Computadora";
      case "other":
        return "Otro";
      default:
        return deviceType;
    }
  };

  const renderNewDeviceForm = () => (
    <>
      {formState.deviceType && formState.brand && formState.model && (
        <div className="bg-gray-50 rounded p-4 mb-6 border border-gray-200">
          <h3 className="text-base font-medium text-gray-800 mb-3">
            Dispositivo seleccionado
          </h3>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-full p-1 border border-gray-200 flex items-center justify-center w-8 h-8">
                {getDeviceIcon(formState.deviceType)}
              </div>
              <span className="font-medium text-gray-700">
                {getDeviceName(formState.deviceType)}
              </span>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
              <span className="text-gray-500">•</span>
              <span className="font-medium">{formState.brand}</span>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
              <span className="text-gray-500">•</span>
              <span className="font-medium">{formState.model}</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleContinue} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label
              htmlFor="imei"
              className="block text-sm font-medium text-gray-700"
            >
              {formState.deviceType === "computer"
                ? "Número de serie"
                : "IMEI / Número de serie"}
            </label>
            <input
              type="text"
              id="imei"
              name="imei"
              value={formState.imei || ""}
              onChange={(e) => onChange({ imei: e.target.value })}
              className="block w-full rounded border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 p-2 border text-gray-800"
              placeholder={
                formState.deviceType === "computer"
                  ? "Ej., C02XXXXXX"
                  : "Ej., 123456789012345"
              }
            />
            {formState.deviceType === "mobile" && (
              <p className="text-xs text-gray-500 mt-1">
                Para obtener el IMEI, marca *#06# en el teclado del teléfono
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label
              htmlFor="inventoryCode"
              className="block text-sm font-medium text-gray-700"
            >
              Código de inventario
            </label>
            <input
              type="text"
              id="inventoryCode"
              name="inventoryCode"
              value={formState.inventoryCode || ""}
              onChange={(e) => onChange({ inventoryCode: e.target.value })}
              className="block w-full rounded border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 p-2 border text-gray-800"
              placeholder="Código de inventario (si aplica)"
            />
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
          <h3 className="text-base font-medium text-gray-800 mb-3 flex items-center gap-2">
            <Lock className="w-5 h-5 text-gray-600" />
            Método de desbloqueo
          </h3>
          <UnlockMethodTabs
            activeTab={unlockMethod}
            onChange={setUnlockMethod}
          />
          {unlockMethod === "code" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-gray-700"
                >
                  Código PIN o contraseña
                </label>
                <input
                  type="text"
                  id="code"
                  name="code"
                  value={formState.code || ""}
                  onChange={(e) =>
                    onChange({ code: e.target.value, pattern: "" })
                  }
                  className="block w-full rounded border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 p-2 border text-gray-800"
                  placeholder="Código PIN o contraseña"
                />
                <p className="text-xs text-gray-500">
                  Ingresa el código numérico o alfanumérico para desbloquear el
                  dispositivo
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="pattern"
                  className="block text-sm font-medium text-gray-700"
                >
                  Patrón de desbloqueo
                </label>
                <PatternLock
                  value={formState.pattern || ""}
                  onChange={(value) => onChange({ pattern: value, code: "" })}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Dibuja el patrón utilizado para desbloquear el dispositivo
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Estado actual del dispositivo{" "}
            <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {deviceStatuses.map((status) => (
              <div
                key={status.value}
                className={`border ${
                  formState.status === status.value
                    ? "border-gray-700 bg-gray-50"
                    : "border-gray-200 bg-white"
                } cursor-pointer rounded p-3 flex flex-col items-center justify-center gap-2 transition-all text-center hover:border-gray-400 hover:shadow-sm h-24`}
                onClick={() => handleSelectStatus(status.value)}
              >
                <div className={status.iconColor}>{status.icon}</div>
                <span className="text-xs font-medium text-gray-700">
                  {status.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="observations"
            className="block text-sm font-medium text-gray-700"
          >
            Observaciones adicionales
          </label>
          <textarea
            id="observations"
            name="observations"
            value={formState.observations || ""}
            onChange={(e) => onChange({ observations: e.target.value })}
            className="block w-full rounded border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 p-2 border text-gray-800"
            placeholder="Detalles adicionales sobre el estado del dispositivo"
            rows={3}
          />
        </div>

        <div className="flex justify-between pt-4 border-t border-gray-200 mt-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            <ChevronLeft className="w-4 h-4 mr-2" /> Atrás
          </button>
          <button
            type="submit"
            className="inline-flex items-center rounded border border-transparent bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            disabled={!formState.status}
          >
            Continuar <ChevronRight className="w-4 h-4 ml-2" />
          </button>
        </div>
      </form>
    </>
  );

  const renderExistingDeviceForm = () => {
    const selectedDevice = clientDevices.find(
      (d) => d.id === selectedExistingDevice,
    );
    if (!selectedDevice) return null;

    return (
      <div className="bg-gray-50 p-5 rounded-lg border border-gray-200 mb-6">
        <h3 className="text-base font-medium text-gray-800 mb-3">
          Dispositivo seleccionado
        </h3>
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-white rounded-full p-2 border border-gray-200">
            {getDeviceIcon(selectedDevice.deviceType)}
          </div>
          <div>
            <p className="font-medium text-gray-800 text-lg">
              {selectedDevice.brand} {selectedDevice.model}
            </p>
            <p className="text-sm text-gray-600">
              {selectedDevice.deviceType === "computer"
                ? "Número de serie: "
                : "IMEI: "}{" "}
              {selectedDevice.imei}
            </p>
            {selectedDevice.inventoryCode && (
              <p className="text-sm text-gray-600">
                Código de inventario: {selectedDevice.inventoryCode}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleContinue} className="space-y-5">
          <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
            <h3 className="text-base font-medium text-gray-800 mb-3 flex items-center gap-2">
              <Lock className="w-5 h-5 text-gray-600" />
              Método de desbloqueo
            </h3>
            <UnlockMethodTabs
              activeTab={unlockMethod}
              onChange={setUnlockMethod}
            />
            {unlockMethod === "code" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Código PIN o contraseña
                  </label>
                  <input
                    type="text"
                    id="code"
                    name="code"
                    value={formState.code || ""}
                    onChange={(e) =>
                      onChange({ code: e.target.value, pattern: "" })
                    }
                    className="block w-full rounded border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 p-2 border text-gray-800"
                    placeholder="Código PIN o contraseña"
                  />
                  <p className="text-xs text-gray-500">
                    Ingresa el código numérico o alfanumérico para desbloquear
                    el dispositivo
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="pattern"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Patrón de desbloqueo
                  </label>
                  <PatternLock
                    value={formState.pattern || ""}
                    onChange={(value) => onChange({ pattern: value, code: "" })}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Dibuja el patrón utilizado para desbloquear el dispositivo
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Estado actual del dispositivo
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {deviceStatuses.map((status) => (
                <div
                  key={status.value}
                  className={`border ${
                    formState.status === status.value
                      ? "border-gray-700 bg-gray-50"
                      : "border-gray-200 bg-white"
                  } cursor-pointer rounded p-3 flex flex-col items-center justify-center gap-2 transition-all text-center hover:border-gray-400 hover:shadow-sm h-24`}
                  onClick={() => handleSelectStatus(status.value)}
                >
                  <div className={status.iconColor}>{status.icon}</div>
                  <span className="text-xs font-medium text-gray-700">
                    {status.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="observations"
              className="block text-sm font-medium text-gray-700"
            >
              Observaciones adicionales
            </label>
            <textarea
              id="observations"
              name="observations"
              value={formState.observations || ""}
              onChange={(e) => onChange({ observations: e.target.value })}
              className="block w-full rounded border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500 p-2 border text-gray-800"
              placeholder="Detalles adicionales sobre el estado del dispositivo"
              rows={3}
            />
          </div>

          <div className="flex justify-between pt-4 border-t border-gray-200 mt-6">
            <button
              type="button"
              onClick={() => setSelectedExistingDevice(null)}
              className="inline-flex items-center rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              <X className="w-4 h-4 mr-2" /> Cambiar dispositivo
            </button>
            <button
              type="submit"
              className="inline-flex items-center rounded border border-transparent bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              disabled={!formState.status}
            >
              Continuar <ChevronRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        </form>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-200">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Detalles del dispositivo
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Completa la información del dispositivo para continuar
              </p>
            </div>
          </div>
        </div>

        {/* Existing Devices Section */}
        {clientDevices.length > 0 && !selectedExistingDevice && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Dispositivos registrados
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Selecciona un dispositivo existente o registra uno nuevo
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {clientDevices.map((device) => (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => handleSelectExistingDevice(device.id)}
                  className="border-2 border-gray-200 rounded-xl p-4 text-left hover:border-gray-400 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg p-3 group-hover:from-gray-200 group-hover:to-gray-300 transition-all">
                      {getDeviceIcon(device.deviceType)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {device.brand} {device.model}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {device.deviceType === "computer" ? "Serie" : "IMEI"}:{" "}
                        {device.imei}
                      </p>
                      {device.inventoryCode && (
                        <p className="text-xs text-gray-400 mt-1">
                          Inv: {device.inventoryCode}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">o</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedExistingDevice(null)}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-gray-400 hover:bg-gray-50 transition-all group"
            >
              <div className="flex flex-col items-center gap-2">
                <div className="bg-gray-100 rounded-full p-3 group-hover:bg-gray-200 transition-colors">
                  <Smartphone className="w-6 h-6 text-gray-600" />
                </div>
                <p className="font-medium text-gray-900">
                  Registrar nuevo dispositivo
                </p>
                <p className="text-sm text-gray-500">
                  Agrega un dispositivo diferente
                </p>
              </div>
            </button>
          </div>
        )}

        {/* Selected Existing Device Form */}
        {selectedExistingDevice ? (
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 mb-6 border border-blue-100">
              <div className="flex items-start gap-4">
                <div className="bg-white rounded-xl p-3 shadow-sm">
                  {getDeviceIcon(
                    clientDevices.find((d) => d.id === selectedExistingDevice)
                      ?.deviceType || "",
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {
                      clientDevices.find((d) => d.id === selectedExistingDevice)
                        ?.brand
                    }{" "}
                    {
                      clientDevices.find((d) => d.id === selectedExistingDevice)
                        ?.model
                    }
                  </h3>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">
                        {clientDevices.find(
                          (d) => d.id === selectedExistingDevice,
                        )?.deviceType === "computer"
                          ? "Número de serie:"
                          : "IMEI:"}
                      </span>{" "}
                      {
                        clientDevices.find(
                          (d) => d.id === selectedExistingDevice,
                        )?.imei
                      }
                    </p>
                    {clientDevices.find((d) => d.id === selectedExistingDevice)
                      ?.inventoryCode && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Inventario:</span>{" "}
                        {
                          clientDevices.find(
                            (d) => d.id === selectedExistingDevice,
                          )?.inventoryCode
                        }
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedExistingDevice(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleContinue} className="space-y-6">
              {/* Unlock Method */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-5 h-5 text-gray-600" />
                  <h3 className="text-base font-semibold text-gray-900">
                    Método de desbloqueo
                  </h3>
                </div>
                <UnlockMethodTabs
                  activeTab={unlockMethod}
                  onChange={setUnlockMethod}
                />
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                  {unlockMethod === "code" ? (
                    <div className="space-y-3">
                      <label
                        htmlFor="code"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Código PIN o contraseña
                      </label>
                      <input
                        type="text"
                        id="code"
                        name="code"
                        value={formState.code || ""}
                        onChange={(e) =>
                          onChange({ code: e.target.value, pattern: "" })
                        }
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-opacity-20 p-3 border text-gray-900 transition-all"
                        placeholder="Ingresa el código..."
                      />
                      <p className="text-xs text-gray-500 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>
                          Ingresa el código numérico o alfanumérico utilizado
                          para desbloquear
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Patrón de desbloqueo
                      </label>
                      <PatternLock
                        value={formState.pattern || ""}
                        onChange={(value) =>
                          onChange({ pattern: value, code: "" })
                        }
                      />
                      <p className="text-xs text-gray-500 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>
                          Dibuja el patrón conectando los puntos en orden
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-900">
                  Estado del dispositivo <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {deviceStatuses.map((status) => (
                    <button
                      key={status.value}
                      type="button"
                      onClick={() => handleSelectStatus(status.value)}
                      className={`relative border-2 rounded-xl p-4 transition-all ${
                        formState.status === status.value
                          ? "border-gray-800 bg-gray-50 shadow-md"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                      }`}
                    >
                      {formState.status === status.value && (
                        <div className="absolute -top-2 -right-2 bg-gray-800 rounded-full p-1">
                          <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div
                          className={`${status.iconColor} ${
                            formState.status === status.value ? "scale-110" : ""
                          } transition-transform`}
                        >
                          {status.icon}
                        </div>
                        <span className="text-sm font-medium text-gray-700 leading-tight">
                          {status.label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Observations */}
              <div className="space-y-3">
                <label
                  htmlFor="observations"
                  className="block text-sm font-medium text-gray-700"
                >
                  Observaciones adicionales
                  <span className="text-gray-400 font-normal ml-1">
                    (opcional)
                  </span>
                </label>
                <textarea
                  id="observations"
                  name="observations"
                  value={formState.observations || ""}
                  onChange={(e) => onChange({ observations: e.target.value })}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-opacity-20 p-3 border text-gray-900 transition-all resize-none"
                  placeholder="Describe cualquier detalle relevante sobre el estado del dispositivo..."
                  rows={4}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setSelectedExistingDevice(null)}
                  className="flex-1 inline-flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" /> Cambiar dispositivo
                </button>
                <button
                  type="submit"
                  disabled={!formState.status}
                  className="flex-1 inline-flex items-center justify-center rounded-lg border-2 border-transparent bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:from-gray-700 hover:to-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg transition-all"
                >
                  Continuar <ChevronRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* New Device Form */
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            {formState.deviceType && formState.brand && formState.model && (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 mb-6 border border-gray-200">
                <h3 className="text-sm font-medium text-gray-600 mb-3">
                  Dispositivo seleccionado
                </h3>
                <div className="flex items-center gap-4">
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    {getDeviceIcon(formState.deviceType)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-lg font-semibold text-gray-900">
                      {getDeviceName(formState.deviceType)}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-base font-medium text-gray-700">
                      {formState.brand}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-base font-medium text-gray-700">
                      {formState.model}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleContinue} className="space-y-6">
              {/* Device IDs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <label
                    htmlFor="imei"
                    className="block text-sm font-medium text-gray-700"
                  >
                    {formState.deviceType === "computer"
                      ? "Número de serie"
                      : "IMEI / Número de serie"}
                    <span className="text-gray-400 font-normal ml-1">
                      (opcional)
                    </span>
                  </label>
                  <input
                    type="text"
                    id="imei"
                    name="imei"
                    value={formState.imei}
                    onChange={(e) => onChange({ imei: e.target.value })}
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-opacity-20 p-3 border text-gray-900 transition-all"
                    placeholder={
                      formState.deviceType === "computer"
                        ? "Ej., C02XXXXXX"
                        : "Ej., 123456789012345"
                    }
                  />
                  {formState.deviceType === "mobile" && (
                    <p className="text-xs text-gray-500 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        Marca *#06# en el teclado para obtener el IMEI
                      </span>
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <label
                    htmlFor="inventoryCode"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Código de inventario
                    <span className="text-gray-400 font-normal ml-1">
                      (opcional)
                    </span>
                  </label>
                  <input
                    type="text"
                    id="inventoryCode"
                    name="inventoryCode"
                    value={formState.inventoryCode || ""}
                    onChange={(e) =>
                      onChange({ inventoryCode: e.target.value })
                    }
                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-opacity-20 p-3 border text-gray-900 transition-all"
                    placeholder="Código interno..."
                  />
                </div>
              </div>

              {/* Unlock Method */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-5 h-5 text-gray-600" />
                  <h3 className="text-base font-semibold text-gray-900">
                    Método de desbloqueo
                  </h3>
                </div>
                <UnlockMethodTabs
                  activeTab={unlockMethod}
                  onChange={setUnlockMethod}
                />
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                  {unlockMethod === "code" ? (
                    <div className="space-y-3">
                      <label
                        htmlFor="code"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Código PIN o contraseña
                      </label>
                      <input
                        type="text"
                        id="code"
                        name="code"
                        value={formState.code || ""}
                        onChange={(e) =>
                          onChange({ code: e.target.value, pattern: "" })
                        }
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-opacity-20 p-3 border text-gray-900 transition-all"
                        placeholder="Ingresa el código..."
                      />
                      <p className="text-xs text-gray-500 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>
                          Ingresa el código numérico o alfanumérico utilizado
                          para desbloquear
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Patrón de desbloqueo
                      </label>
                      <PatternLock
                        value={formState.pattern || ""}
                        onChange={(value) =>
                          onChange({ pattern: value, code: "" })
                        }
                      />
                      <p className="text-xs text-gray-500 flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>
                          Dibuja el patrón conectando los puntos en orden
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-900">
                  Estado del dispositivo <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {deviceStatuses.map((status) => (
                    <button
                      key={status.value}
                      type="button"
                      onClick={() => handleSelectStatus(status.value)}
                      className={`relative border-2 rounded-xl p-4 transition-all ${
                        formState.status === status.value
                          ? "border-gray-800 bg-gray-50 shadow-md"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                      }`}
                    >
                      {formState.status === status.value && (
                        <div className="absolute -top-2 -right-2 bg-gray-800 rounded-full p-1">
                          <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div
                          className={`${status.iconColor} ${
                            formState.status === status.value ? "scale-110" : ""
                          } transition-transform`}
                        >
                          {status.icon}
                        </div>
                        <span className="text-sm font-medium text-gray-700 leading-tight">
                          {status.label}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Observations */}
              <div className="space-y-3">
                <label
                  htmlFor="observations"
                  className="block text-sm font-medium text-gray-700"
                >
                  Observaciones adicionales
                  <span className="text-gray-400 font-normal ml-1">
                    (opcional)
                  </span>
                </label>
                <textarea
                  id="observations"
                  name="observations"
                  value={formState.observations || ""}
                  onChange={(e) => onChange({ observations: e.target.value })}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-opacity-20 p-3 border text-gray-900 transition-all resize-none"
                  placeholder="Describe cualquier detalle relevante sobre el estado del dispositivo..."
                  rows={4}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onBack}
                  className="flex-1 inline-flex items-center justify-center rounded-lg border-2 border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" /> Atrás
                </button>
                <button
                  type="submit"
                  disabled={!formState.status}
                  className="flex-1 inline-flex items-center justify-center rounded-lg border-2 border-transparent bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:from-gray-700 hover:to-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg transition-all"
                >
                  Continuar <ChevronRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
