'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bell, Settings, User, Sun, Moon } from 'lucide-react';
import styles from './page.module.css';

export default function NavBar() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.navList}>
        <Link
          className={styles.navItem}
          href="/admin/notifications"
          title="Notificaciones"
        >
          <Bell strokeWidth={1.5} />
        </Link>
        <Link
          className={styles.navItem}
          href="/admin/settings"
          title="Configuración"
        >
          <Settings strokeWidth={1.5} />
        </Link>
        <Link
          className={styles.navItem}
          href="/admin/profile"
          title="Perfil"
        >
          <User strokeWidth={1.5} />
        </Link>
        <button
          className={styles.navItem}
          onClick={toggleTheme}
          title="Cambiar tema"
        >
          {theme === 'dark' ? <Sun strokeWidth={1.5} /> : <Moon strokeWidth={1.5} />}
        </button>
      </div>
    </nav>
  );
}