"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Phone } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PickupReminders } from "@/components/notices/PickupReminders";
import { Button, STATUS_LABEL } from "@/components/ui";
import { API_URL, apiFetch } from "@/lib/api";
import { formatEur } from "@/lib/format";
import { ago, dayLabel, longDate, versusLastWeek, type TodaySummary } from "./today";
import styles from "./Today.module.css";

interface StoreOption {
  id: string;
  name: string;
  isActive?: boolean;
}

const order = (id: string) => `/ordenes?orden=${id}`;

/**
 * Design 3.1 «Hoy»: what needs doing today, read in ten seconds. Each figure
 * leads to its list; each row is dealt with from here. No VAT or invoicing.
 */
export function TodayPage() {
  const { user } = useAuth();
  const isPartner = user?.role === "SUPER_ADMIN";
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [data, setData] = useState<TodaySummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isPartner) return;
    apiFetch(`${API_URL}/stores`)
      .then(async (res) => (res.ok ? ((await res.json()) as StoreOption[]) : []))
      .then((list) => setStores(list.filter((s) => s.isActive !== false)))
      .catch(() => undefined);
  }, [isPartner]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch(`${API_URL}/today${storeId ? `?storeId=${storeId}` : ""}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        if (live) setData((await res.json()) as TodaySummary);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [storeId, attempt]);

  const c = data?.counts;
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div>
          <h1 className={styles.title}>Hoy</h1>
          {data && <p className={styles.muted}>{longDate(data.date)}</p>}
        </div>
        {isPartner && stores.length > 1 && (
          <label className={styles.store}>
            Tienda
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Todas</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {failed && (
        <div role="alert" className={styles.error}>
          No se ha podido cargar el panel.{" "}
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      )}
      {!data && !failed && <p className={styles.muted}>Cargando…</p>}

      {data && c && (
        <>
          <section className={styles.stats} aria-label="Cifras de hoy">
            <Stat label="Recibidas hoy" value={c.received} hint={versusLastWeek(c.received, c.receivedLastWeek, data.date)} />
            <Stat
              label="En progreso"
              value={c.inProgress}
              hint={c.inProgressUrgent ? `${c.inProgressUrgent} con prioridad alta o urgente` : "Ninguna urgente"}
            />
            <Stat
              label="Pendientes de piezas"
              value={c.waitingParts}
              hint={c.waitingPartsLate ? `${c.waitingPartsLate} con más de 7 días` : "Ninguna retrasada"}
              alert={c.waitingPartsLate > 0}
            />
            <Stat
              label="Listas para recoger"
              value={c.ready}
              hint={c.readyNotNotified ? `${c.readyNotNotified} sin aviso enviado` : "Todas avisadas"}
              alert={c.readyNotNotified > 0}
            />
            <Stat label="Cobrado hoy" value={formatEur(c.collectedToday)} hint="Cobros menos devoluciones" />
            <Stat label="Pendiente de cobro" value={formatEur(c.pendingBalance)} hint="En órdenes abiertas y entregadas" />
          </section>

          <PickupReminders />

          <div className={styles.cards}>
            <Card
              title="Para avisar"
              total={data.toNotify.total}
              empty="Nada pendiente. Todas las órdenes finalizadas tienen aviso."
            >
              {data.toNotify.rows.map((r) => (
                <Row
                  key={r.id}
                  head={`${r.code} · ${r.clientName}${r.model ? ` · ${r.model}` : ""}`}
                  sub={`Finalizada ${ago(r.days)} · sin aviso`}
                  action={
                    <Link href={order(r.id)} className={styles.action}>
                      Avisar
                    </Link>
                  }
                />
              ))}
            </Card>
            <Card title="Esperando pieza > 7 días" total={data.lateParts.total} empty="Ninguna pieza retrasada.">
              {data.lateParts.rows.map((r) => (
                <Row
                  key={r.id}
                  head={`${r.code} · ${r.clientName}${r.model ? ` · ${r.model}` : ""}`}
                  sub={`${r.days} días esperando`}
                  late
                  action={
                    <Link href={order(r.id)} className={styles.action}>
                      Ver orden
                    </Link>
                  }
                />
              ))}
            </Card>
            <Card title="Sin recoger > 30 días" total={data.uncollected.total} empty="Ningún equipo lleva un mes sin recoger.">
              {data.uncollected.rows.map((r) => (
                <Row
                  key={r.id}
                  head={`${r.code} · ${r.clientName}${r.model ? ` · ${r.model}` : ""}`}
                  sub={[
                    `${r.days} días`,
                    Number(r.balance) > 0 ? `debe ${formatEur(r.balance)}` : "pagado",
                    r.notices ? `${r.notices} ${r.notices === 1 ? "aviso enviado" : "avisos enviados"}` : "sin avisos",
                  ].join(" · ")}
                  late
                  action={
                    r.phone ? (
                      <a href={`tel:${r.phone.replace(/\s/g, "")}`} className={styles.action}>
                        <Phone size={14} aria-hidden />
                        Llamar
                      </a>
                    ) : (
                      <Link href={order(r.id)} className={styles.action}>
                        Ver orden
                      </Link>
                    )
                  }
                />
              ))}
            </Card>
            {data.lowStock && (
              <Card title="Stock bajo" total={data.lowStock.total} empty="Todo por encima del mínimo." more="/inventory">
                {data.lowStock.rows.map((r) => (
                  <Row
                    key={r.id}
                    head={`${r.sku} · ${r.name}`}
                    sub={`Stock ${r.stock} · mín. ${r.minimalStock}`}
                    late={r.stock === 0}
                  />
                ))}
              </Card>
            )}
          </div>

          <div className={styles.cards}>
            <Week week={data.week} />
            <section className={styles.card} aria-labelledby="open-status">
              <h2 id="open-status" className={styles.cardTitle}>
                Abiertas por estado
                <span className={styles.count}>{Object.values(data.openByStatus).reduce((a, b) => a + b, 0)}</span>
              </h2>
              <dl className={styles.statusList}>
                {(Object.keys(data.openByStatus) as (keyof TodaySummary["openByStatus"])[]).map((s) => (
                  <div key={s}>
                    <dt>{STATUS_LABEL[s]}</dt>
                    <dd>{data.openByStatus[s]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, alert }: { label: string; value: ReactNode; hint: string; alert?: boolean }) {
  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>{value}</p>
      <p className={alert ? styles.late : styles.muted}>{hint}</p>
    </div>
  );
}

function Card({
  title,
  total,
  empty,
  more = "/ordenes",
  children,
}: {
  title: string;
  total: number;
  empty: string;
  more?: string;
  children: ReactNode;
}) {
  const id = `card-${title.replace(/\W+/g, "-")}`;
  return (
    <section className={styles.card} aria-labelledby={id}>
      <h2 id={id} className={styles.cardTitle}>
        {title}
        <span className={styles.count}>{total}</span>
        {total > 0 && (
          <Link href={more} className={styles.more}>
            Ver todo
          </Link>
        )}
      </h2>
      {total === 0 ? (
        <p className={styles.emptyLine}>
          <CheckCircle2 size={16} aria-hidden className={styles.ok} />
          {empty}
        </p>
      ) : (
        <ul className={styles.rows}>{children}</ul>
      )}
    </section>
  );
}

function Row({ head, sub, action, late }: { head: string; sub: string; action?: ReactNode; late?: boolean }) {
  return (
    <li className={styles.row}>
      <div className={styles.rowText}>
        <p>{head}</p>
        <p className={late ? styles.late : styles.muted}>{sub}</p>
      </div>
      {action}
    </li>
  );
}

function Week({ week }: { week: TodaySummary["week"] }) {
  const max = Math.max(1, ...week.flatMap((d) => [d.received, d.delivered]));
  const received = week.reduce((a, d) => a + d.received, 0);
  const delivered = week.reduce((a, d) => a + d.delivered, 0);
  return (
    <section className={styles.card} aria-labelledby="week">
      <h2 id="week" className={styles.cardTitle}>
        Actividad de la semana
      </h2>
      <p className={styles.legend}>
        <span className={styles.keyIn} aria-hidden /> Entradas {received}
        <span className={styles.keyOut} aria-hidden /> Entregas {delivered}
        <span className={styles.muted}>
          · Saldo taller {received - delivered >= 0 ? "+" : ""}
          {received - delivered}
        </span>
      </p>
      <ol className={styles.bars}>
        {week.map((d, i) => (
          <li key={d.day} aria-label={`${dayLabel(d.day, i === week.length - 1)}: ${d.received} entradas, ${d.delivered} entregas`}>
            <div className={styles.pair}>
              <span className={styles.barIn} style={{ height: `${(d.received / max) * 100}%` }} />
              <span className={styles.barOut} style={{ height: `${(d.delivered / max) * 100}%` }} />
            </div>
            <span className={styles.muted}>{dayLabel(d.day, i === week.length - 1)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
