"use client";

import React, { useState } from 'react';
import { ChevronLeft, Check, User, Smartphone, Wrench, AlertCircle, Phone, Mail, MapPin, XCircle } from 'lucide-react';

interface ReviewSubmitFormProps {
  formState: {
    dispositivo: {
      id: number | null;
      brand: string | null;
      model: string | null;
      imei: string;
      code: string;
      inventoryCode: string;
      type: string;
      pattern: string;
      status: string;
      observations: string;
    };
    cliente: {
      id: number | null;
      firstName: string;
      lastName: string;
      dniType: string;
      dni: string;
      email: string;
      phoneNumber: string;
      address: string;
      city: string;
      postalCode: string;
      preferredContact: string;
      observations: string;
      isActive: boolean;
    };
    servicio: {
      services: Array<{
        id?: number;
        name: string;
        price: number;
        description?: string;
      }>;
      totalPrice: number;
      amountPaid: number;
      balance: number;
      paymentStatus: string;
      paymentMethod: string;
      priority: string;
      assignedTo: string;
      status: string;
      observations: string;
    };
  };
  onSubmit: () => void;
  onBack: () => void;
}

interface ValidationError {
  field: string;
  message: string;
  hint: string;
}

const ReviewSubmitForm: React.FC<ReviewSubmitFormProps> = ({ formState, onSubmit, onBack }) => {
  const { dispositivo, cliente, servicio } = formState ?? {};
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  const validateForm = (): ValidationError[] => {
    const errors: ValidationError[] = [];
    const nameRegex = /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s\-']+$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[\d\s\+\-\(\)]{7,15}$/;

    if (!cliente?.firstName?.trim()) {
      errors.push({
        field: "Nombre",
        message: "El nombre del cliente es obligatorio",
        hint: "Vuelve al Paso 1 y rellena el campo Nombre",
      });
    } else if (!nameRegex.test(cliente.firstName)) {
      errors.push({
        field: "Nombre",
        message: "El nombre contiene caracteres no permitidos (solo letras, espacios, guiones y apóstrofes)",
        hint: "Vuelve al Paso 1 y corrige el campo Nombre — evita números y símbolos",
      });
    }

    if (cliente?.lastName && !nameRegex.test(cliente.lastName)) {
      errors.push({
        field: "Apellido",
        message: "El apellido contiene caracteres no permitidos",
        hint: "Vuelve al Paso 1 y corrige el campo Apellido — solo letras y guiones",
      });
    }

    if (cliente?.phoneNumber?.trim() && !phoneRegex.test(cliente.phoneNumber)) {
      errors.push({
        field: "Teléfono",
        message: "El número de teléfono tiene un formato inválido",
        hint: "Vuelve al Paso 1 y corrige el Teléfono — debe tener entre 7 y 15 dígitos (ej: 612 345 678)",
      });
    }

    if (cliente?.email?.trim() && !emailRegex.test(cliente.email)) {
      errors.push({
        field: "Email",
        message: "El email no tiene un formato válido",
        hint: "Vuelve al Paso 1 y corrige el Email (ej: correo@dominio.com)",
      });
    }

    if (!dispositivo?.status) {
      errors.push({
        field: "Estado del dispositivo",
        message: "Debes seleccionar el estado actual del dispositivo",
        hint: "Vuelve al Paso de Detalles del Dispositivo y selecciona un estado",
      });
    }

    if (dispositivo?.imei?.trim() && !/^[\d\w\-]{5,20}$/.test(dispositivo.imei)) {
      errors.push({
        field: "IMEI / Número de serie",
        message: "El IMEI o número de serie tiene un formato inválido",
        hint: "Vuelve al Paso de Detalles del Dispositivo y revisa el campo IMEI (5–20 caracteres alfanuméricos)",
      });
    }

    return errors;
  };

  const handleSubmit = () => {
    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    onSubmit();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PAID':
        return 'text-green-600 bg-green-50';
      case 'PENDING':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toUpperCase()) {
      case 'HIGH':
        return 'text-red-600 bg-red-50';
      case 'MEDIUM':
        return 'text-yellow-600 bg-yellow-50';
      case 'LOW':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <Check className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Revisión y Confirmación</h1>
            <p className="text-gray-600">Revisa todos los datos antes de enviar el formulario</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Cliente Section */}
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Información del Cliente</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                {cliente?.firstName} {cliente?.lastName}
              </h3>
              <p className="text-gray-600">{cliente?.dniType}: {cliente?.dni}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">{cliente?.phoneNumber || 'No especificado'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">{cliente?.email || 'No especificado'}</span>
              </div>
            </div>

            {cliente?.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                <div className="text-sm text-gray-600">
                  <p>{cliente?.address}</p>
                  <p>{cliente?.city} {cliente?.postalCode}</p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-md p-3">
              <p className="text-sm font-medium text-gray-700">Contacto preferido:</p>
              <p className="text-sm text-gray-600 capitalize">{cliente?.preferredContact.toLowerCase()}</p>
            </div>

            {cliente?.observations && (
              <div className="bg-blue-50 rounded-md p-3">
                <p className="text-sm font-medium text-blue-700">Observaciones:</p>
                <p className="text-sm text-blue-600">{cliente?.observations}</p>
              </div>
            )}
          </div>
        </div>

        {/* Dispositivo Section */}
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Información del Dispositivo</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                {dispositivo?.brand.name} {dispositivo?.model}
              </h3>
              <p className="text-gray-600">{dispositivo.type}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dispositivo?.imei && (
                <div className="bg-white rounded-md p-3">
                  <p className="text-sm font-medium text-gray-700">IMEI:</p>
                  <p className="text-sm text-gray-600 font-mono">{dispositivo.imei}</p>
                </div>
              )}
              {dispositivo?.code && (
                <div className="bg-white rounded-md p-3">
                  <p className="text-sm font-medium text-gray-700">Código:</p>
                  <p className="text-sm text-gray-600 font-mono">{dispositivo.code}</p>
                </div>
              )}
              {dispositivo?.inventoryCode && (
                <div className="bg-white rounded-md p-3">
                  <p className="text-sm font-medium text-gray-700">Código Inventario:</p>
                  <p className="text-sm text-gray-600 font-mono">{dispositivo.inventoryCode}</p>
                </div>
              )}
              {dispositivo?.pattern && (
                <div className="bg-white rounded-md p-3">
                  <p className="text-sm font-medium text-gray-700">Patrón:</p>
                  <p className="text-sm text-gray-600">{dispositivo.pattern}</p>
                </div>
              )}
            </div>

            {dispositivo?.status && (
              <div className="bg-white rounded-md p-3">
                <p className="text-sm font-medium text-gray-700">Estado:</p>
                <p className="text-sm text-gray-600 capitalize">{dispositivo.status}</p>
              </div>
            )}

            {dispositivo?.observations && (
              <div className="bg-green-50 rounded-md p-3">
                <p className="text-sm font-medium text-green-700">Observaciones:</p>
                <p className="text-sm text-green-600">{dispositivo.observations}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Servicio Section - Full Width */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
            <Wrench className="w-4 h-4 text-purple-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Información del Servicio</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Services List */}
          <div className="lg:col-span-2">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Servicios Solicitados</h3>
            {servicio?.services.length > 0 ? (
              <div className="space-y-3">
                {servicio?.services.map((service, index) => (
                  <div key={index} className="bg-white rounded-md p-4 border border-gray-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{service.name}</h4>
                        {service.description && (
                          <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                        )}
                      </div>
                      <span className="text-lg font-semibold text-purple-600">
                        {formatCurrency(service.price)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-md p-4 border border-gray-200 text-center">
                <p className="text-gray-500">No hay servicios especificados</p>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Resumen Económico</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-semibold">{formatCurrency(servicio?.totalPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pagado:</span>
                  <span className="font-semibold text-green-600">{formatCurrency(servicio?.amountPaid)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-600">Saldo:</span>
                  <span className="font-semibold text-orange-600">{formatCurrency(servicio?.balance)}</span>
                </div>
              </div>
            </div>

            {/* Status Tags */}
            <div className="space-y-3">
              {servicio?.paymentStatus && (
                <div className={`px-3 py-2 rounded-full text-sm font-medium ${getPaymentStatusColor(servicio.paymentStatus)}`}>
                  Estado de Pago: {servicio.paymentStatus}
                </div>
              )}
              
              {servicio?.priority && (
                <div className={`px-3 py-2 rounded-full text-sm font-medium ${getPriorityColor(servicio.priority)}`}>
                  Prioridad: {servicio.priority}
                </div>
              )}

              {servicio?.assignedTo && (
                <div className="bg-blue-50 px-3 py-2 rounded-full text-sm font-medium text-blue-700">
                  Asignado a: {servicio.assignedTo}
                </div>
              )}
            </div>
          </div>
        </div>

        {servicio?.observations && (
          <div className="mt-6 bg-purple-50 rounded-md p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-purple-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-purple-700">Observaciones del Servicio:</p>
                <p className="text-sm text-purple-600 mt-1">{servicio.observations}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Validation Errors Panel */}
      {validationErrors.length > 0 && (
        <div className="mt-8 bg-red-50 border border-red-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <h3 className="text-base font-semibold text-red-800">
              Se encontraron {validationErrors.length} error{validationErrors.length !== 1 ? "es" : ""} — corrígelos antes de enviar
            </h3>
          </div>
          <ul className="space-y-3">
            {validationErrors.map((err, i) => (
              <li key={i} className="bg-white border border-red-100 rounded-md p-3">
                <p className="text-sm font-semibold text-red-700">{err.field}</p>
                <p className="text-sm text-red-600 mt-0.5">{err.message}</p>
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {err.hint}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200 font-medium"
        >
          <ChevronLeft className="w-4 h-4" />
          Volver
        </button>

        <button
          type="button"
          onClick={handleSubmit}
          className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium shadow-md hover:shadow-lg"
        >
          <Check className="w-4 h-4" />
          Confirmar y Enviar
        </button>
      </div>
    </div>
  );
};

export default ReviewSubmitForm;