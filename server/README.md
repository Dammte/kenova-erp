# 2InSide / Kenova · API (NestJS)

API del ERP interno. NestJS 11 + TypeORM 0.3 + PostgreSQL.

## Puesta en marcha local

```bash
cp .env.example .env          # rellena DATABASE_URL y DEVICE_SECRET_KEY
npm ci
npm run migration:run         # aplica las migraciones a TU base de datos local
npm run user:create-super-admin -- --email tu@correo.es --username tu.usuario --name "Tu Nombre"
npm run start:dev
```

El script imprime una contraseña temporal; al entrar por primera vez se pide cambiarla.

## Tests

```bash
npm test               # unitarios
npm run test:e2e       # e2e contra PostgreSQL real
```

Los e2e crean una base de datos desechable por fichero (`e2e_xxxx`), cargan el esquema
que producía el código anterior (`test/fixtures/legacy-schema.sql`), ejecutan las
migraciones reales y la borran al terminar. Necesitan un PostgreSQL local; por defecto
`postgres://postgres@127.0.0.1:5433/postgres`, o el que indiques en `E2E_DATABASE_URL`.
El harness se niega a ejecutarse contra hosts gestionados (Render, Neon, Supabase, AWS).
CI (`.github/workflows/ci.yml`) levanta su propio PostgreSQL.

## Seguridad: cómo funciona

| Tema | Implementación |
|---|---|
| Autenticación | Sesión en servidor (tabla `sessions`). El navegador guarda un token aleatorio de 256 bits en una cookie `HttpOnly; SameSite=Lax; Secure` (`__Host-sid` en producción). En BD solo se guarda su SHA-256. Caducidad por inactividad 12 h y absoluta 7 días. Logout y cambio de contraseña revocan en servidor. |
| Contraseñas | Argon2id (m=19 MiB, t=2, p=1). Bloqueo 15 min tras 5 fallos. Mismo mensaje para email inexistente y contraseña errónea. Cuentas nuevas con contraseña temporal obligatoria de cambiar. |
| Autorización | Guard global: **todas** las rutas exigen sesión salvo `POST /api/auth/login` y `GET /api/health`. Roles `SUPER_ADMIN` y `STORE_ADMIN`; gestión de usuarios, auditoría y borrado de clientes/órdenes solo `SUPER_ADMIN`. Un test recorre todas las rutas registradas y comprueba el 401. |
| PIN / patrón de desbloqueo | Cifrado AES-256-GCM con clave de entorno (`DEVICE_SECRET_KEY`) y el id del dispositivo como dato autenticado. Nunca sale en listados, órdenes, impresiones ni logs. Se consulta con `POST /api/devices/:id/unlock-secret/reveal`, que queda auditado (quién y cuándo). Se borra automáticamente 7 días después de que todas las órdenes del dispositivo estén entregadas o canceladas. |
| Validación | `ValidationPipe` global con `whitelist`: los campos no declarados se descartan (no se puede fijar `id`, `createdAt`, `paymentStatus`, `performedBy`…). El estado de pago y el saldo los calcula el servidor. |
| Integridad | Clientes y órdenes se borran de forma lógica; la FK orden→cliente es `RESTRICT`. El historial es de solo lectura/alta y registra el autor desde la sesión. El consumo de piezas es un `UPDATE … WHERE stock >= n` en una transacción: sin stock negativo ni pérdidas por concurrencia. |
| CSRF | `SameSite=Lax` + comprobación de `Origin` en métodos que modifican. |
| Otros | Helmet, rate limit (300/min por IP; 10/min en login), errores sin SQL ni trazas, logs sin parámetros de consultas, PDF validado por firma y limitado a 10 MB en la subida. |
| Auditoría | Tabla `audit_events` (solo inserción): logins, logouts, cambios de contraseña, gestión de usuarios, revelado/borrado de PIN, borrados, consumo de piezas. `GET /api/audit-events` (SUPER_ADMIN). |

## Variables de entorno (producción)

| Variable | Obligatoria | Valor |
|---|---|---|
| `DATABASE_URL` | sí | cadena de conexión de Render |
| `NODE_ENV` | sí | `production` (activa SSL a BD y cookie `Secure`) |
| `DEVICE_SECRET_KEY` | sí | 32 bytes aleatorios en base64. **Guárdala en un gestor de contraseñas**: sin ella los PIN guardados no se pueden leer |
| `CORS_ORIGIN` | sí | origen exacto del frontend, p. ej. `https://2-in-side-client.vercel.app` |
| `TRUST_PROXY_HOPS` | recomendada | `2` detrás del rewrite de Vercel + proxy de Render (IP real del cliente para el rate limit) |
| `DEVICE_SECRET_RETENTION_DAYS` | no | por defecto 7 |
| `GEMINI_API_KEY` | no | importador de facturas con IA |

## Despliegue de la migración de seguridad (orden obligatorio)

La migración `1759000000000-SecurityFoundation` cambia el esquema. La app **no arranca**
si hay migraciones pendientes, para no servir peticiones contra un esquema que no conoce.

1. **Copia de seguridad** de producción (`pg_dump`) y comprobar que se puede restaurar.
2. En Render, añadir `DEVICE_SECRET_KEY`, `CORS_ORIGIN` y `TRUST_PROXY_HOPS=2`.
3. En Render, cambiar el *Start Command* a
   `npm run migration:run:prod && npm run start:prod`
   (la migración es una única transacción: si falla, no se aplica nada y el despliegue anterior sigue activo).
4. En Vercel, añadir `API_ORIGIN=https://twoinside.onrender.com` (ya no se usa `NEXT_PUBLIC_API_URL`).
5. Fusionar el PR en un momento de poca actividad. Primero se despliega Render; Vercel a continuación.
6. Crear las cuentas SUPER_ADMIN (las cuentas antiguas quedan **desactivadas**: tenían la contraseña en claro):
   `DATABASE_URL=… npm run user:create-super-admin:prod -- --email … --username … --name "…"`
   (desde la Shell de Render o desde un equipo de confianza con la URL externa de la BD).
7. Entrar, cambiar la contraseña temporal y crear las cuentas de tienda desde **Usuarios**.

Qué hace la migración con los datos existentes: cifra los PIN/patrones y elimina las
columnas en claro; desactiva las cuentas de usuario antiguas y elimina la columna de
contraseñas en claro (no borra usuarios); convierte los DNI `''` en `NULL`; añade borrado
lógico a órdenes y cambia la FK orden→cliente a `RESTRICT`.

**Rollback**: `npm run migration:revert` (o `typeorm migration:revert -d dist/data-source.js`)
restaura el esquema anterior y descifra los PIN a sus columnas (necesita la misma
`DEVICE_SECRET_KEY`). Las contraseñas antiguas no se recuperan.

## Migraciones

```bash
npm run migration:generate -- src/migration/NombreDelCambio   # genera a partir de las entidades
npm run migration:run
npm run migration:revert
```

`synchronize` está desactivado siempre. Todo cambio de esquema va en una migración revisada.
