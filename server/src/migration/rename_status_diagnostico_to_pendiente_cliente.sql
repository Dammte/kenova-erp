-- Migración: renombrar valor del enum 'diagnostico' → 'pendiente_cliente'
-- Ejecutar este script directamente en la base de datos (la app usa synchronize: false).
-- Requiere PostgreSQL 10+.

-- Paso 1: Renombrar el valor en el tipo enum de PostgreSQL
ALTER TYPE "service_orders_status_enum" RENAME VALUE 'diagnostico' TO 'pendiente_cliente';

-- Paso 2: Actualizar registros existentes (por si acaso TypeORM los dejó como string)
UPDATE service_orders SET status = 'pendiente_cliente' WHERE status = 'diagnostico';
