"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";
import logoSinFondo from "../../assets/logo.webp";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Package,
  ClipboardList,
  Wrench,
  UserCog,
  LogOut,
  KeyRound,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

export default function Sidebar() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  return (
    <div
      className={`${styles.sidebar} ${
        isSidebarOpen ? styles.open : styles.closed
      }`}
      onMouseEnter={() => setIsSidebarOpen(true)}
      onMouseLeave={() => setIsSidebarOpen(false)}
    >
      <div className={styles.sidebarContent}>
        <div className={styles.logoContainer}>
          <Image
            src={logoSinFondo}
            alt="Logo"
            width={isSidebarOpen ? 50 : 30}
            height={isSidebarOpen ? 50 : 30}
            className={styles.logo}
          />
          {isSidebarOpen && <span className={styles.brandName}>2InSide</span>}
        </div>

        <nav className={styles.navigation}>
          <Link href="/dashboard" className={styles.navItem} title="Dashboard">
            <LayoutDashboard
              size={isSidebarOpen ? 20 : 24}
              className={styles.navIcon}
            />
            {isSidebarOpen && <span>Dashboard</span>}
          </Link>
          <Link
            href="/serviceOrders"
            className={styles.navItem}
            title="Service Orders"
          >
            <ClipboardList
              size={isSidebarOpen ? 20 : 24}
              className={styles.navIcon}
            />
            {isSidebarOpen && <span>Service Orders</span>}
          </Link>
          <Link href="/clients" className={styles.navItem} title="Clients">
            <Users size={isSidebarOpen ? 20 : 24} className={styles.navIcon} />
            {isSidebarOpen && <span>Clients</span>}
          </Link>
          {/* <Link href="/devices" className={styles.navItem} title="Devices">
            <Cpu size={isSidebarOpen ? 20 : 24} className={styles.navIcon} />
            {isSidebarOpen && <span>Devices</span>}
          </Link> */}
          <Link href="/inventory" className={styles.navItem} title="inventory">
            <Package
              size={isSidebarOpen ? 20 : 24}
              className={styles.navIcon}
            />
            {isSidebarOpen && <span>Inventory</span>}
          </Link>
          <Link href="/services" className={styles.navItem} title="services">
            <Wrench size={isSidebarOpen ? 20 : 24} className={styles.navIcon} />
            {isSidebarOpen && <span>Services</span>}
          </Link>
          {/* Finanzas — oculto hasta que esté listo para producción
          <Link href="/finanzas" className={styles.navItem} title="Finanzas">
            <TrendingUp size={isSidebarOpen ? 20 : 24} className={styles.navIcon} />
            {isSidebarOpen && <span>Finanzas</span>}
          </Link> */}
          {user?.role === "SUPER_ADMIN" && (
            <Link href="/usuarios" className={styles.navItem} title="Usuarios">
              <UserCog size={isSidebarOpen ? 20 : 24} className={styles.navIcon} />
              {isSidebarOpen && <span>Usuarios</span>}
            </Link>
          )}
        </nav>

        <nav className={styles.navigation} style={{ marginTop: "auto" }}>
          {isSidebarOpen && user && (
            <span className={styles.navItem} style={{ cursor: "default", fontSize: 12, opacity: 0.8 }}>
              {user.fullName}
            </span>
          )}
          <Link href="/cuenta/contrasena" className={styles.navItem} title="Cambiar contraseña">
            <KeyRound size={isSidebarOpen ? 20 : 24} className={styles.navIcon} />
            {isSidebarOpen && <span>Contraseña</span>}
          </Link>
          <button
            type="button"
            onClick={logout}
            className={styles.navItem}
            title="Cerrar sesión"
            style={{ background: "none", border: "none", width: "100%", textAlign: "left", cursor: "pointer" }}
          >
            <LogOut size={isSidebarOpen ? 20 : 24} className={styles.navIcon} />
            {isSidebarOpen && <span>Cerrar sesión</span>}
          </button>
        </nav>
      </div>
    </div>
  );
}
