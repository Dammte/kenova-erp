'use client';

import { Moon, Sun } from "lucide-react";
import styles from "./page.module.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import Image from 'next/image';

/**
 * 
 * @Description This could be changed for a component with NavBar, because there are some Links that it's the same.
 */

function NavBarHome() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark";
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle("dark", savedTheme === "dark");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.navLogo}>
        <Image src="https://i.ibb.co/ymmrS1sd/logo-Sin-Fondo-Lh-H57o-7.webp" alt="Logo" width={150} height={150} priority/>
      </div>
      <div className={styles.navList}>
        <Link
          className={styles.navItem}
          href="/"
          title="Inicio"
        >
          Inicio
        </Link>
        <Link
          className={styles.navItem}
          href="#repair"
          title="Reparación"
        >
          Reparación
        </Link>
        <Link className={styles.navItem} href="/" title="Precios">
          Precios
        </Link>
        <Link className={styles.navItem} href="/" title="Contacto">
          Contacto
        </Link>
        {/* biome-ignore lint/a11y/useButtonType: <explanation> */}
        <button
          className={styles.navItem}
          onClick={toggleTheme}
          title="Cambiar tema"
        >
          {theme === "dark" ? (
            <Sun strokeWidth={1.5} />
          ) : (
            <Moon strokeWidth={1.5} />
          )}
        </button>
      </div>
    </nav>
  );
}

export default NavBarHome;
