-- Schema produced by the entities on `master` before the security foundation
-- migration (generated with TypeORM synchronize against an empty database).
-- Used only by the e2e tests to exercise the migration exactly as production
-- would run it. Not a migration; never run against a real database.
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--



--
-- Name: client_dnitype_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.client_dnitype_enum AS ENUM (
    'NIF',
    'NIE',
    'PASSPORT'
);



--
-- Name: client_preferredcontact_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.client_preferredcontact_enum AS ENUM (
    'EMAIL',
    'PHONE',
    'SMS'
);



--
-- Name: service_orders_paymentmethod_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.service_orders_paymentmethod_enum AS ENUM (
    'cash',
    'card',
    'transfer',
    'other'
);



--
-- Name: service_orders_paymentstatus_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.service_orders_paymentstatus_enum AS ENUM (
    'pending',
    'paid_partial',
    'paid'
);



--
-- Name: service_orders_priority_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.service_orders_priority_enum AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);



--
-- Name: service_orders_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.service_orders_status_enum AS ENUM (
    'en_progreso',
    'pendiente_cliente',
    'pendiente_piezas',
    'finalizado',
    'entregado',
    'cancelado'
);



--
-- Name: sticky_notes_type_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.sticky_notes_type_enum AS ENUM (
    'normal',
    'important',
    'urgent'
);



--
-- Name: users_role_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.users_role_enum AS ENUM (
    'ADMIN',
    'MANAGER'
);



SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: brand; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.brand (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(50) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);



--
-- Name: client; Type: TABLE; Schema: public; Owner: postgres
--

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



--
-- Name: devices; Type: TABLE; Schema: public; Owner: postgres
--

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



--
-- Name: inventory; Type: TABLE; Schema: public; Owner: postgres
--

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



--
-- Name: model; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.model (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "brandId" uuid,
    name character varying(50) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);



--
-- Name: service_history; Type: TABLE; Schema: public; Owner: postgres
--

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



--
-- Name: service_order_services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_order_services (
    "serviceOrderId" uuid NOT NULL,
    "serviceId" uuid NOT NULL
);



--
-- Name: service_orders; Type: TABLE; Schema: public; Owner: postgres
--

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



--
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

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



--
-- Name: sticky_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sticky_notes (
    id integer NOT NULL,
    content text NOT NULL,
    type public.sticky_notes_type_enum DEFAULT 'normal'::public.sticky_notes_type_enum NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderServiceId" uuid
);



--
-- Name: sticky_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.sticky_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



--
-- Name: sticky_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.sticky_notes_id_seq OWNED BY public.sticky_notes.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

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



--
-- Name: sticky_notes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sticky_notes ALTER COLUMN id SET DEFAULT nextval('public.sticky_notes_id_seq'::regclass);


--
-- Name: service_order_services PK_36e142e0c4a3bfea58e9b0d9cae; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_order_services
    ADD CONSTRAINT "PK_36e142e0c4a3bfea58e9b0d9cae" PRIMARY KEY ("serviceOrderId", "serviceId");


--
-- Name: sticky_notes PK_615fc1d0c6b75c46aa2a7dd5f0a; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT "PK_615fc1d0c6b75c46aa2a7dd5f0a" PRIMARY KEY (id);


--
-- Name: inventory PK_82aa5da437c5bbfb80703b08309; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT "PK_82aa5da437c5bbfb80703b08309" PRIMARY KEY (id);


--
-- Name: service_history PK_87a290fb43cabe61c55e0481dce; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT "PK_87a290fb43cabe61c55e0481dce" PRIMARY KEY (id);


--
-- Name: service_orders PK_914aa74962ee83b10614ea2095d; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT "PK_914aa74962ee83b10614ea2095d" PRIMARY KEY (id);


--
-- Name: client PK_96da49381769303a6515a8785c7; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT "PK_96da49381769303a6515a8785c7" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: brand PK_a5d20765ddd942eb5de4eee2d7f; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brand
    ADD CONSTRAINT "PK_a5d20765ddd942eb5de4eee2d7f" PRIMARY KEY (id);


--
-- Name: devices PK_b1514758245c12daf43486dd1f0; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT "PK_b1514758245c12daf43486dd1f0" PRIMARY KEY (id);


--
-- Name: services PK_ba2d347a3168a296416c6c5ccb2; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT "PK_ba2d347a3168a296416c6c5ccb2" PRIMARY KEY (id);


--
-- Name: model PK_d6df271bba301d5cc79462912a4; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.model
    ADD CONSTRAINT "PK_d6df271bba301d5cc79462912a4" PRIMARY KEY (id);


--
-- Name: client UQ_6436cc6b79593760b9ef921ef12; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client
    ADD CONSTRAINT "UQ_6436cc6b79593760b9ef921ef12" UNIQUE (email);


--
-- Name: IDX_19441e4df22cc19f4f2dd71f46; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_19441e4df22cc19f4f2dd71f46" ON public.service_history USING btree ("serviceOrderId");


--
-- Name: IDX_3c0d187776a730fd84c660cffe; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IDX_3c0d187776a730fd84c660cffe" ON public.devices USING btree ("inventoryCode");


--
-- Name: IDX_60c28461807c2f2386654f424e; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_60c28461807c2f2386654f424e" ON public.service_history USING btree ("deviceId");


--
-- Name: IDX_6436cc6b79593760b9ef921ef1; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_6436cc6b79593760b9ef921ef1" ON public.client USING btree (email);


--
-- Name: IDX_6c7a2f2d81210bd5029af920e9; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_6c7a2f2d81210bd5029af920e9" ON public.service_order_services USING btree ("serviceId");


--
-- Name: IDX_713947cb05057fe181804e1f16; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_713947cb05057fe181804e1f16" ON public.service_orders USING btree ("clientId");


--
-- Name: IDX_97672ac88f789774dd47f7c8be; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON public.users USING btree (email);


--
-- Name: IDX_CLIENT_ID; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_CLIENT_ID" ON public.devices USING btree (client_id);


--
-- Name: IDX_c33f32cdf6993fe3852073b0d5; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IDX_c33f32cdf6993fe3852073b0d5" ON public.inventory USING btree (sku);


--
-- Name: IDX_c5ed18c1b8f2e71a4b9639344f; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_c5ed18c1b8f2e71a4b9639344f" ON public.service_orders USING btree ("deviceId");


--
-- Name: IDX_d0a4b8b9b38b6600a92e2edb35; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IDX_d0a4b8b9b38b6600a92e2edb35" ON public.devices USING btree (imei);


--
-- Name: IDX_e0c777a3ef74826d814e8a9e2a; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_e0c777a3ef74826d814e8a9e2a" ON public.service_order_services USING btree ("serviceOrderId");


--
-- Name: IDX_fb529f57900726838c410fa83d; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IDX_fb529f57900726838c410fa83d" ON public.client USING btree (dni);


--
-- Name: IDX_fe0bb3f6520ee0469504521e71; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON public.users USING btree (username);


--
-- Name: service_history FK_19441e4df22cc19f4f2dd71f46c; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT "FK_19441e4df22cc19f4f2dd71f46c" FOREIGN KEY ("serviceOrderId") REFERENCES public.service_orders(id) ON DELETE CASCADE;


--
-- Name: service_history FK_60c28461807c2f2386654f424e6; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT "FK_60c28461807c2f2386654f424e6" FOREIGN KEY ("deviceId") REFERENCES public.devices(id) ON DELETE SET NULL;


--
-- Name: devices FK_60d13d94fcf9362b2ae4dd1108a; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT "FK_60d13d94fcf9362b2ae4dd1108a" FOREIGN KEY (client_id) REFERENCES public.client(id) ON DELETE SET NULL;


--
-- Name: service_order_services FK_6c7a2f2d81210bd5029af920e9d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_order_services
    ADD CONSTRAINT "FK_6c7a2f2d81210bd5029af920e9d" FOREIGN KEY ("serviceId") REFERENCES public.services(id);


--
-- Name: service_orders FK_713947cb05057fe181804e1f164; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT "FK_713947cb05057fe181804e1f164" FOREIGN KEY ("clientId") REFERENCES public.client(id) ON DELETE CASCADE;


--
-- Name: model FK_7996700d600159cdf20dc0d0816; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.model
    ADD CONSTRAINT "FK_7996700d600159cdf20dc0d0816" FOREIGN KEY ("brandId") REFERENCES public.brand(id);


--
-- Name: service_orders FK_c5ed18c1b8f2e71a4b9639344f8; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_orders
    ADD CONSTRAINT "FK_c5ed18c1b8f2e71a4b9639344f8" FOREIGN KEY ("deviceId") REFERENCES public.devices(id) ON DELETE SET NULL;


--
-- Name: service_order_services FK_e0c777a3ef74826d814e8a9e2ac; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_order_services
    ADD CONSTRAINT "FK_e0c777a3ef74826d814e8a9e2ac" FOREIGN KEY ("serviceOrderId") REFERENCES public.service_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: service_history FK_f5cd5477775d3a5120806ac644e; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_history
    ADD CONSTRAINT "FK_f5cd5477775d3a5120806ac644e" FOREIGN KEY ("performedBy") REFERENCES public.users(id);


--
-- Name: sticky_notes FK_ff5b4832d3dd15271a13facb5cd; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sticky_notes
    ADD CONSTRAINT "FK_ff5b4832d3dd15271a13facb5cd" FOREIGN KEY ("orderServiceId") REFERENCES public.service_orders(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


