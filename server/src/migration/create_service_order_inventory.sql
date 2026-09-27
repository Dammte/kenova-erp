-- Ejecutar este script en la base de datos para crear la tabla de repuestos en órdenes de servicio.
-- La app usa synchronize: false, por lo que las tablas nuevas deben crearse manualmente.

CREATE TABLE IF NOT EXISTS service_order_inventory (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id   UUID          NOT NULL,
  inventory_id       UUID          NOT NULL,
  quantity           INT           NOT NULL DEFAULT 1,
  unit_price_at_time DECIMAL(10,2) NULL,

  CONSTRAINT fk_soi_service_order
    FOREIGN KEY (service_order_id)
    REFERENCES service_orders(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_soi_inventory
    FOREIGN KEY (inventory_id)
    REFERENCES inventory(id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_soi_service_order_id ON service_order_inventory(service_order_id);
CREATE INDEX IF NOT EXISTS idx_soi_inventory_id     ON service_order_inventory(inventory_id);
