"use client";

import { Phone, Tablet, Laptop, CircleEllipsis } from "lucide-react";
import styles from "../page.module.css";
import BackButtonHeader from "../backButtonHeader/page";

export default function DeviceTypeSelector({ onSelect, onBack }) {
  const tiposDispositivos = [
    { id: "movil", nombre: "Móvil", icon: Phone },
    { id: "tablet", nombre: "Tablet", icon: Tablet },
    { id: "computador", nombre: "Computador", icon: Laptop },
    { id: "otro", nombre: "Otro", icon: CircleEllipsis },
  ];

  return (
    <div className={styles.progressWrapper}>
      <BackButtonHeader
        title={"Seleccione tipo de dispositivo"}
        onBack={onBack}
      ></BackButtonHeader>
      <div className={styles.optionsGrid}>
        {tiposDispositivos.map((tipo) => (
          <button
            key={tipo.id}
            onClick={() => onSelect(tipo.id)}
            className={styles.deviceTypeButton}
          >
            <tipo.icon size={48} className={styles.deviceIcon} />
            <span className={styles.deviceName}>{tipo.nombre}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
