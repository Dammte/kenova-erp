"use client";

import styles from "../page.module.css";
import BackButtonHeader from "../backButtonHeader/page";
import { Smartphone, PlusCircle } from "lucide-react";

export default function DeviceOptionSelector({
  onSelectExisting,
  onSelectNew,
  onBack,
}) {
  return (
    <div className={styles.progressWrapper}>
      <BackButtonHeader title="Dispositivo" onBack={onBack} />

      <div className={styles.deviceOptionContainer}>
        <h2 style={{ marginBottom: "20px", textAlign: "center" }}>
          ¿Qué deseas hacer?
        </h2>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            marginTop: "30px",
          }}
        >
          <button
            onClick={onSelectExisting}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "20px",
              backgroundColor: "#f8f9fa",
              border: "1px solid #dee2e6",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            }}
          >
            <Smartphone
              size={48}
              color="#007bff"
              style={{ marginRight: "20px" }}
            />
            <div>
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  display: "block",
                  marginBottom: "5px",
                }}
              >
                Seleccionar un dispositivo existente
              </span>
              <span style={{ fontSize: "14px", color: "#6c757d" }}>
                Usa un dispositivo previamente registrado para este cliente
              </span>
            </div>
          </button>

          <button
            onClick={onSelectNew}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "20px",
              backgroundColor: "#f8f9fa",
              border: "1px solid #dee2e6",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            }}
          >
            <PlusCircle
              size={48}
              color="#28a745"
              style={{ marginRight: "20px" }}
            />
            <div>
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  display: "block",
                  marginBottom: "5px",
                }}
              >
                Registrar un nuevo dispositivo
              </span>
              <span style={{ fontSize: "14px", color: "#6c757d" }}>
                Añadir un dispositivo nuevo para este cliente
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
