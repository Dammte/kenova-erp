"use client";

import { API_URL, apiFetch } from "@/lib/api";

import { useState, useEffect } from "react";
import ProgressBar from "@/components/serviceOrders/deviceInformation/progressBar/page";
import DeviceTypeSelector from "@/components/serviceOrders/deviceInformation/deviceTypeSelector/page";
import BrandSelector from "@/components/serviceOrders/deviceInformation/brandSelector/page";
import ModelSelector from "@/components/serviceOrders/deviceInformation/modelSelector/page";
import CustomerInfoForm from "@/components/serviceOrders/deviceInformation/customerInfoForm/page";
import DeviceDetailsForm from "@/components/serviceOrders/deviceInformation/deviceDetailForm/page";
import ReviewSubmitForm from "@/components/serviceOrders/deviceInformation/reviewSubmitForm/page";
import ServiceDetailsForm from "@/components/serviceOrders/deviceInformation/serviceDetailForm/page";
import DeviceOptionSelector from "@/components/serviceOrders/deviceInformation/deviceOptionSelector/page";
import ExistingDeviceSelector from "@/components/serviceOrders/deviceInformation/existingDeviceSelector/page";
import styles from "./page.module.css";
import { showToast } from "nextjs-toast-notify";

export default function NewServiceOrder() {
  const initialFormState = {
    dispositivo: {
      id: null,
      brand: null,
      model: null,
      imei: null,
      code: "",
      inventoryCode: "",
      type: "",
      pattern: "",
      status: "",
      observations: "",
    },
    cliente: {
      id: null,
      firstName: "",
      lastName: "",
      dniType: "NIF",
      dni: null,
      email: null,
      phoneNumber: "",
      address: "",
      city: "",
      postalCode: "",
      preferredContact: "PHONE",
      observations: "",
      isActive: true,
    },
    servicio: {
      services: [],
      inventoryItems: [],
      totalPrice: 0,
      amountPaid: 0,
      balance: 0,
      paymentStatus: "PENDING",
      paymentMethod: "",
      priority: "",
      assignedTo: "",
      status: "PENDIENTE_CLIENTE",
      observations: "",
    },
  };

  const [formState, setFormState] = useState(initialFormState);
  const [currentStep, setCurrentStep] = useState(0);
  const [isExistingClient, setIsExistingClient] = useState(false);

  const allSteps = [
    "Información del Cliente",
    "Opciones de Dispositivo",
    "Seleccionar Dispositivo Existente",
    "Tipo de Dispositivo",
    "Marca",
    "Modelo",
    "Detalles del Dispositivo",
    "Detalles del Servicio",
    "Revisión y Envío",
  ];

  const [activeSteps, setActiveSteps] = useState([0, 3, 4, 5, 6, 7, 8]);

  useEffect(() => {
    if (isExistingClient && formState.cliente.id) {
      setActiveSteps([0, 1, 2, 7, 8]);
    } else {
      setActiveSteps([0, 3, 4, 5, 6, 7, 8]);
    }
  }, [isExistingClient, formState.cliente.id]);

  const getStepIndex = (activeIndex) => {
    return activeSteps[activeIndex];
  };

  const visibleSteps = activeSteps.map((index) => allSteps[index]);

  const updateFormField = (section, field, value) => {
    setFormState((prevState) => ({
      ...prevState,
      [section]: {
        ...prevState[section],
        [field]: value,
      },
    }));
  };

  const goToStep = (step) => {
    if (step < 0 || step >= activeSteps.length) {
      console.error(`Invalid step ${step}. Max: ${activeSteps.length - 1}`);
      return;
    }
    setCurrentStep(step);
  };

  const handleCustomerInfoChange = (update) => {
    if (update.target) {
      const { name, value } = update.target;
      updateFormField("cliente", name, value);
    } else {
      setFormState((prevState) => ({
        ...prevState,
        cliente: { ...prevState.cliente, ...update },
      }));

      if (update.id) {
        setIsExistingClient(true);
      } else {
        setIsExistingClient(false);
      }
    }
  };

  const handleExistingDeviceSelection = (device) => {
    setFormState((prevState) => ({
      ...prevState,
      dispositivo: {
        ...device,
      },
    }));
    goToStep(3);
  };

  const handleCreateNewDevice = () => {
    setFormState((prevState) => ({
      ...prevState,
      dispositivo: {
        ...initialFormState.dispositivo,
      },
    }));

    setActiveSteps([0, 3, 4, 5, 6, 7, 8]);
    goToStep(1);
  };

  const handleTipoSelection = (tipo) => {
    setFormState({
      ...formState,
      dispositivo: {
        ...formState.dispositivo,
        type: tipo,
        brand: null,
        model: null,
      },
    });
    goToStep(2);
  };

  const handleMarcaSelection = (brand) => {
    updateFormField("dispositivo", "brand", brand);
    updateFormField("dispositivo", "model", null);
    goToStep(3);
  };

  const handleModeloSelection = (model) => {
    updateFormField("dispositivo", "model", model);
    goToStep(4);
  };

  const handleDeviceDetailsChange = (update) => {
    setFormState((prevState) => ({
      ...prevState,
      dispositivo: { ...prevState.dispositivo, ...update },
    }));
  };

  const handleServiceDetailsChange = (update) => {
    setFormState((prevState) => ({
      ...prevState,
      servicio: {
        ...prevState.servicio,
        ...update,
      },
    }));
  };

  const handleSubmit = async () => {
    try {
      let clientId = formState.cliente.id;
      let deviceId = formState.dispositivo.id;

      if (!clientId) {
        const clientResponse = await apiFetch(`${API_URL}/clients`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dniType: formState.cliente.dniType,
            dni: formState.cliente.dni,
            firstName: formState.cliente.firstName,
            lastName: formState.cliente.lastName,
            email: formState.cliente.email,
            phoneNumber: formState.cliente.phoneNumber,
            address: formState.cliente.address,
            postalCode: formState.cliente.postalCode,
            city: formState.cliente.city,
            preferredContact: formState.cliente.preferredContact,
            observations: formState.cliente.observations,
            isActive: formState.cliente.isActive,
          }),
        });

        if (!clientResponse.ok) throw new Error("Error al crear el cliente");
        const clientData = await clientResponse.json();
        clientId = clientData.id;
      }

      if (!deviceId) {
        const deviceResponse = await apiFetch(`${API_URL}/devices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imei: formState.dispositivo.imei,
            inventoryCode:
              formState.dispositivo.inventoryCode ||
              Math.floor(Math.random() * 1000000).toString(),
            type: formState.dispositivo.type,
            brand: formState.dispositivo.brand?.name,
            model: formState.dispositivo.model,
            observations: formState.dispositivo.observations,
            pattern: formState.dispositivo.pattern,
            status: formState.dispositivo.status,
            code: formState.dispositivo.code,
            clientId: clientId,
          }),
        });

        if (!deviceResponse.ok)
          throw new Error("Error al crear el dispositivo");
        const deviceData = await deviceResponse.json();
        deviceId = deviceData.id;
      }

      const serviceOrderResponse = await apiFetch(`${API_URL}/service-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId,
          deviceId: deviceId,
          priority: formState.servicio.priority.toLowerCase() || "medium",
          assignedTo: formState.servicio.assignedTo,
          status: formState.servicio.status.toLowerCase(),
          totalPrice: Number(formState.servicio.totalPrice),
          amountPaid: Number(formState.servicio.amountPaid),
          balance: Number(formState.servicio.balance),
          serviceIds: formState.servicio.services.map((service) => service.id),
          inventoryIds: formState.servicio.inventoryItems.map((item) => item.id),
          paymentStatus: formState.servicio.paymentStatus.toLowerCase(),
          paymentMethod:
            formState.servicio.paymentMethod.toLowerCase() || "cash",
          observations: formState.servicio.observations,
        }),
      });

      if (!serviceOrderResponse.ok)
        throw new Error("Error al crear la orden de servicio");
      showToast.success("Orden de servicio creada con éxito", {
        duration: 5000,
        position: "top-right"
      });
      setFormState(initialFormState);
      setIsExistingClient(false);
      setCurrentStep(0);
      window.location.href = "/serviceOrders";

    } catch (error) {
      console.error(error);
      showToast.error("Error al crear la orden de servicio", {
        duration: 5000,
        position: "top-right"
      });
    }
  };

  const getComponentProps = () => {
    const commonProps = { onBack: () => goToStep(currentStep - 1) };

    const currentStepIndex = getStepIndex(currentStep);

    switch (currentStepIndex) {
      case 0:
        return {
          formState: formState.cliente,
          onChange: handleCustomerInfoChange,
          onSubmit: () => goToStep(currentStep + 1),
          ...commonProps,
        };
      case 1:
        return {
          onSelectExisting: () => goToStep(2),
          onSelectNew: handleCreateNewDevice,
          ...commonProps,
        };
      case 2:
        return {
          clientId: formState.cliente.id,
          onSelect: handleExistingDeviceSelection,
          onNewDevice: handleCreateNewDevice,
          ...commonProps,
        };
      case 3:
        return {
          onSelect: handleTipoSelection,
          ...commonProps,
        };
      case 4:
        return {
          tipoDispositivo: formState.dispositivo.type,
          onSelect: handleMarcaSelection,
          ...commonProps,
        };
      case 5:
        return {
          tipoDispositivo: formState.dispositivo.type,
          brand: formState.dispositivo.brand,
          onSelect: handleModeloSelection,
          ...commonProps,
        };
      case 6:
        return {
          formState: formState.dispositivo,
          onChange: handleDeviceDetailsChange,
          onSubmit: () => goToStep(currentStep + 1),
          ...commonProps,
        };
      case 7:
        return {
          formState: formState.servicio,
          onChange: handleServiceDetailsChange,
          onSubmit: () => goToStep(currentStep + 1),
          ...commonProps,
        };
      case 8:
        return {
          formState: formState,
          onSubmit: handleSubmit,
          ...commonProps,
        };
      default:
        return {};
    }
  };

  const renderCurrentStep = () => {
    const props = getComponentProps();

    const currentStepIndex = getStepIndex(currentStep);

    switch (currentStepIndex) {
      case 0:
        return <CustomerInfoForm {...props} />;
      case 1:
        return <DeviceOptionSelector {...props} />;
      case 2:
        return <ExistingDeviceSelector {...props} />;
      case 3:
        return <DeviceTypeSelector {...props} />;
      case 4:
        return <BrandSelector {...props} />;
      case 5:
        return <ModelSelector {...props} />;
      case 6:
        return <DeviceDetailsForm {...props} />;
      case 7:
        return <ServiceDetailsForm {...props} />;
      case 8:
        return <ReviewSubmitForm {...props} />;
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            Servicio de Recepción de Dispositivos
          </h1>
          <p className={styles.subtitle}>
            Por favor complete la información requerida
          </p>
        </div>
        <ProgressBar currentStep={currentStep} steps={visibleSteps} />
        {renderCurrentStep()}
      </div>
    </div>
  );
}
