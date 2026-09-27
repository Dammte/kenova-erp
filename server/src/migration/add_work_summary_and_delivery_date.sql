-- Migración: añadir workSummary, estimatedDeliveryDate y completedAt a service_orders
-- Ejecutar en la base de datos (la app usa synchronize: false).

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS "workSummary"          TEXT        NULL,
  ADD COLUMN IF NOT EXISTS "estimatedDeliveryDate" DATE        NULL,
  ADD COLUMN IF NOT EXISTS "completedAt"           TIMESTAMP   NULL;
