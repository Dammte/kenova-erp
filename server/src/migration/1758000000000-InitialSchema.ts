import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/**
 * Base schema for an empty database (new deployments such as Kenova).
 *
 * It is the schema the entities on `master` produced with `synchronize`
 * (same DDL as test/fixtures/legacy-schema.sql). A database that already has
 * that schema (the 2InSide production database) is left untouched, so this
 * migration only records itself there. SecurityFoundation then evolves it.
 */
export class InitialSchema1758000000000 implements MigrationInterface {
  name = 'InitialSchema1758000000000';

  public async up(q: QueryRunner): Promise<void> {
    const [{ exists }] = await q.query(
      `SELECT to_regclass('public.users') IS NOT NULL AS "exists"`,
    );
    if (exists) return;
    const uuid = await uuidFunction(q);
    await q.query(SCHEMA.split('public.uuid_generate_v4()').join(uuid));
  }

  public async down(q: QueryRunner): Promise<void> {
    // Only reverts what up() creates on an empty database.
    await q.query(`
      DROP TABLE IF EXISTS "service_order_services", "service_history", "service_orders",
        "devices", "client", "inventory", "model", "brand", "services", "sticky_notes", "users" CASCADE;
      DROP TYPE IF EXISTS "client_dnitype_enum", "client_preferredcontact_enum",
        "service_orders_paymentmethod_enum", "service_orders_paymentstatus_enum",
        "service_orders_priority_enum", "service_orders_status_enum",
        "sticky_notes_type_enum", "users_role_enum";
    `);
  }
}

const SCHEMA = `
CREATE TYPE public.client_dnitype_enum AS ENUM (
    'NIF',
    'NIE',
    'PASSPORT'
);

CREATE TYPE public.client_preferredcontact_enum AS ENUM (
    'EMAIL',
    'PHONE',
    'SMS'
);

CREATE TYPE public.service_orders_paymentmethod_enum AS ENUM (
    'cash',
    'card',
    'transfer',
    'other'
);

CREATE TYPE public.service_orders_paymentstatus_enum AS ENUM (
    'pending',
    'paid_partial',
    'paid'
);

CREATE TYPE public.service_orders_priority_enum AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);

CREATE TYPE public.service_orders_status_enum AS ENUM (
    'en_progreso',
    'pendiente_cliente',
    'pendiente_piezas',
    'finalizado',
    'entregado',
    'cancelado'
);

CREATE TYPE public.sticky_notes_type_enum AS ENUM (
    'normal',
    'important',
    'urgent'
);

CREATE TYPE public.users_role_enum AS ENUM (
    'ADMIN',
    'MANAGER'
);

CREATE TABLE public.brand (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(50) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.client (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "dniType" public.client_dnitype_enum DEFAULT 'NIF'::public.client_dnitype_enum NOT NULL,
    dni character varying(20) DEFAULT ''::character varying,
    "firstName" character varying(50) NOT NULL,
    "lastName" character varying(50) NOT NULL,
    email character varying(100),
    "phoneNumber" character varying(20) DEFAULT ''::character varying,
    address character varying,
    "postalCode" character varying(10),
    city character varying(50),
    "preferredContact" public.client_preferredcontact_enum DEFAULT 'PHONE'::public.client_preferredcontact_enum NOT NULL,
    observations text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp without time zone
);

CREATE TABLE public.devices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    imei character varying(20),
    "inventoryCode" character varying(30),
    type character varying(30) NOT NULL,
    brand character varying(50) NOT NULL,
    model character varying(50) NOT NULL,
    status character varying(50),
    code character varying(50),
    pattern character varying(50),
    observations text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    client_id uuid
);

CREATE TABLE public.inventory (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sku character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(150),
    "imagePath" character varying(50),
    brand character varying(50),
    category character varying(50),
    model character varying(50),
    ubication character varying(50),
    provider character varying(50),
    stock integer,
    "minimalStock" integer,
    "salesPrice" numeric,
    "costPrice" character varying(50),
    "createdBy" character varying(50),
    "updatedBy" character varying(50),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "deletedAt" timestamp without time zone
);

CREATE TABLE public.model (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "brandId" uuid,
    name character varying(50) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.service_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    action character varying(50) NOT NULL,
    description text NOT NULL,
    "partsReplaced" text,
    "partsCost" numeric(10,2),
    "laborCost" numeric(10,2),
    "serviceOrderId" uuid NOT NULL,
    "deviceId" uuid,
    "performedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "performedBy" uuid
);

CREATE TABLE public.service_order_services (
    "serviceOrderId" uuid NOT NULL,
    "serviceId" uuid NOT NULL
);

CREATE TABLE public.service_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "clientId" uuid NOT NULL,
    "deviceId" uuid,
    priority public.service_orders_priority_enum DEFAULT 'medium'::public.service_orders_priority_enum NOT NULL,
    "assignedTo" text,
    status public.service_orders_status_enum DEFAULT 'pendiente_cliente'::public.service_orders_status_enum NOT NULL,
    "totalPrice" numeric(10,2) DEFAULT '0'::numeric,
    "amountPaid" numeric(10,2) DEFAULT '0'::numeric,
    balance numeric(10,2) DEFAULT '0'::numeric,
    "paymentStatus" public.service_orders_paymentstatus_enum DEFAULT 'pending'::public.service_orders_paymentstatus_enum,
    "paymentMethod" public.service_orders_paymentmethod_enum,
    observations text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.services (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    description text NOT NULL,
    price numeric(10,2) NOT NULL,
    "estimatedTime" character varying,
    category character varying,
    available boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sticky_notes (
    id integer NOT NULL,
    content text NOT NULL,
    type public.sticky_notes_type_enum DEFAULT 'normal'::public.sticky_notes_type_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderServiceId" uuid
);

CREATE SEQUENCE public.sticky_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sticky_notes_id_seq OWNED BY public.sticky_notes.id;

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    username character varying(50) NOT NULL,
    "fullName" character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    role public.users_role_enum DEFAULT 'MANAGER'::public.users_role_enum NOT NULL,
    password character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.sticky_notes ALTER COLUMN id SET DEFAULT nextval('public.sticky_notes_id_seq'::regclass);

ALTER TABLE ONLY public.service_order_services
    ADD CONSTRAINT "PK_36e142e0c4a3bfea58e9b0d9cae" PRIMARY KEY ("serviceOrderId", "serviceId");

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT "PK_615fc1d0c6b75c46aa2a7dd5f0a" PRIMARY KEY (id);

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT "PK_82aa5da437c5bbfb80703b08309" PRIMARY KEY (id);

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT "PK_87a290fb43cabe61c55e0481dce" PRIMARY KEY (id);

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT "PK_914aa74962ee83b10614ea2095d" PRIMARY KEY (id);

ALTER TABLE ONLY public.client
    ADD CONSTRAINT "PK_96da49381769303a6515a8785c7" PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);

ALTER TABLE ONLY public.brand
    ADD CONSTRAINT "PK_a5d20765ddd942eb5de4eee2d7f" PRIMARY KEY (id);

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT "PK_b1514758245c12daf43486dd1f0" PRIMARY KEY (id);

ALTER TABLE ONLY public.services
    ADD CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY (id);

ALTER TABLE ONLY public.model
    ADD CONSTRAINT "PK_d6df271bba301d5cc79462912a4" PRIMARY KEY (id);

ALTER TABLE ONLY public.client
    ADD CONSTRAINT "UQ_6436cc6b79593760b9ef921ef12" UNIQUE (email);

CREATE INDEX "IDX_19441e4df22cc19f4f2dd71f46" ON public.service_history USING btree ("serviceOrderId");

CREATE UNIQUE INDEX "IDX_3c0d187776a730fd84c660cffe" ON public.devices USING btree ("inventoryCode");

CREATE INDEX "IDX_60c28461807c2f2386654f424e" ON public.service_history USING btree ("deviceId");

CREATE INDEX "IDX_6436cc6b79593760b9ef921ef1" ON public.client USING btree (email);

CREATE INDEX "IDX_6c7a2f2d81210bd5029af920e9" ON public.service_order_services USING btree ("serviceId");

CREATE INDEX "IDX_713947cb05057fe181804e1f16" ON public.service_orders USING btree ("clientId");

CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON public.users USING btree (email);

CREATE INDEX "IDX_CLIENT_ID" ON public.devices USING btree (client_id);

CREATE UNIQUE INDEX "IDX_c33f32cdf6993fe3852073b0d5" ON public.inventory USING btree (sku);

CREATE INDEX "IDX_c5ed18c1b8f2e71a4b9639344f" ON public.service_orders USING btree ("deviceId");

CREATE UNIQUE INDEX "IDX_d0a4b8b9b38b6600a92e2edb35" ON public.devices USING btree (imei);

CREATE INDEX "IDX_e0c777a3ef74826d814e8a9e2a" ON public.service_order_services USING btree ("serviceOrderId");

CREATE UNIQUE INDEX "IDX_fb529f57900726838c410fa83d" ON public.client USING btree (dni);

CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON public.users USING btree (username);

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT "FK_19441e4df22cc19f4f2dd71f46c" FOREIGN KEY ("serviceOrderId") REFERENCES public.service_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT "FK_60c28461807c2f2386654f424e6" FOREIGN KEY ("deviceId") REFERENCES public.devices(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT "FK_60d13d94fcf9362b2ae4dd1108a" FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_order_services
    ADD CONSTRAINT "FK_6c7a2f2d81210bd5029af920e9d" FOREIGN KEY ("serviceId") REFERENCES public.services(id);

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT "FK_713947cb05057fe181804e1f164" FOREIGN KEY ("clientId") REFERENCES public.client(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.model
    ADD CONSTRAINT "FK_7996700d600159cdf20dc0d0816" FOREIGN KEY ("brandId") REFERENCES public.brand(id);

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT "FK_c5ed18c1b8f2e71a4b9639344f8" FOREIGN KEY ("deviceId") REFERENCES public.devices(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.service_order_services
    ADD CONSTRAINT "FK_e0c777a3ef74826d814e8a9e2ac" FOREIGN KEY ("serviceOrderId") REFERENCES public.service_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT "FK_f5cd5477775d3a5120806ac644e" FOREIGN KEY ("performedBy") REFERENCES public.users(id);

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT "FK_ff5b4832d3dd15271a13facb5cd" FOREIGN KEY ("orderServiceId") REFERENCES public.service_orders(id) ON DELETE CASCADE;
`;
