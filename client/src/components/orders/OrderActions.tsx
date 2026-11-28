"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Banknote, Check, MoreHorizontal, PackageCheck, PackageOpen, PhoneIncoming, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { useAuth } from "@/components/auth/AuthProvider";
import { API_URL, apiFetch, errorMessage } from "@/lib/api";
import { DeliverForm } from "./DeliverForm";
import { CancelForm } from "./CancelForm";
import { awayReason, type OrderDetail, type OrderPayment } from "./orderDetail";
import { FinishForm } from "./FinishForm";
import { PartOrderForm, PartOrderList, usePartOrders } from "./PartOrderSection";
import styles from "./OrderPanel.module.css";

/**
 * Design R3 3.3: the panel's main action for the order's status, «Cobrar» as
 * the second one while money is owed, and the rest under «⋯». Other moves
 * stay in the list's status menu.
 */
export function OrderActions({
  order,
  payments,
  onChanged,
  onCharge,
  onNotify,
  notified = true,
  menu,
}: {
  order: OrderDetail;
  payments: OrderPayment[];
  onChanged: () => void;
  /** Opens the charge form; offered while something is owed. */
  onCharge?: () => void;
  /** Opens the notice form; a finished order not notified yet leads with it. */
  onNotify?: () => void;
  /** Whether the client was told since the order was finished. */
  notified?: boolean;
  /** Links that go first under «⋯» (printing, the quote). */
  menu?: ReactNode;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<"idle" | "finish" | "deliver" | "cancel" | "part" | "reject">("idle");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Parts are ordered from the partners' stock (decision 5).
  const partner = user?.role === "SUPER_ADMIN";
  const [partsSeen, setPartsSeen] = useState(0);
  const ordered = usePartOrders(order.id, partner, `${order.status}:${partsSeen}`);
  const partsChanged = () => {
    setPartsSeen((n) => n + 1);
    onChanged();
  };

  const patch = async (body: object): Promise<boolean> => {
    setSaving(true);
    setProblem(null);
    try {
      const res = await apiFetch(`${API_URL}/service-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setProblem(await errorMessage(res, "No se ha podido guardar el cambio."));
        return false;
      }
      onChanged();
      return true;
    } catch {
      setProblem("No se ha podido guardar el cambio. Comprueba la conexión.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const resume = (label: string, icon: ReactNode, hint: string) => (
    <>
      <p className={styles.hint}>{hint}</p>
      <Button variant="primary" icon={icon} loading={saving} onClick={() => patch({ status: "en_progreso" })}>
        {label}
      </Button>
    </>
  );

  let body: ReactNode;
  const { status } = order;
  if (status === "pendiente_cliente") {
    body = resume("Cliente respondió", <PhoneIncoming size={16} aria-hidden />, "La orden vuelve a «En progreso».");
  } else if (status === "pendiente_piezas" && ordered?.length) {
    const waiting = ordered.some((p) => !p.receivedAt);
    body = (
      <>
        <PartOrderList rows={ordered} onReceived={partsChanged} />
        {waiting ? (
          <p className={styles.hint}>Al marcarla recibida se suma al stock.</p>
        ) : (
          resume("Volver a En progreso", <PackageCheck size={16} aria-hidden />, "Pieza recibida: la reparación puede seguir.")
        )}
      </>
    );
  } else if (status === "pendiente_piezas") {
    body = resume("Pieza recibida", <PackageCheck size={16} aria-hidden />, "La orden vuelve a «En progreso».");
  } else if (status === "en_progreso") {
    body =
      step === "finish" ? (
        <FinishForm
          initialWork={order.workDone ?? ""}
          saving={saving}
          withParts={user?.role === "SUPER_ADMIN"}
          onCancel={() => setStep("idle")}
          onSubmit={(payload) => patch(payload)}
        />
      ) : (
        <Button variant="primary" icon={<Check size={16} aria-hidden />} onClick={() => setStep("finish")}>
          Finalizar…
        </Button>
      );
  } else if (status === "finalizado") {
    // A partner store's device must be back at the store before telling the client or handing it over.
    const away = awayReason(order);
    body = away ? (
      <Button variant="primary" icon={<PackageOpen size={16} aria-hidden />} disabledReason={away}>
        Entregar…
      </Button>
    ) :
      step === "deliver" ? (
        <DeliverForm order={order} onCancel={() => setStep("idle")} onDone={onChanged} />
      ) : !notified && onNotify ? (
        <>
          <Button variant="primary" icon={<Send size={16} aria-hidden />} onClick={onNotify}>
            Avisar al cliente
          </Button>
          <Button icon={<PackageOpen size={16} aria-hidden />} onClick={() => setStep("deliver")}>
            Entregar…
          </Button>
        </>
      ) : (
        <Button variant="primary" icon={<PackageOpen size={16} aria-hidden />} onClick={() => setStep("deliver")}>
          Entregar…
        </Button>
      );
  } else {
    // Delivered or cancelled: read only; printing is what is left to do.
    return (
      <section className={styles.next} aria-label="Acciones de la orden">
        <p className={styles.readOnly}>
          {status === "entregado" ? "Entregada" : "Cancelada"} · solo lectura
        </p>
        <div className={styles.actionRow}>
          {onCharge && Number(order.balance) > 0 && status !== "cancelado" && (
            <Button variant="primary" icon={<Banknote size={16} aria-hidden />} onClick={onCharge}>
              Cobrar
            </Button>
          )}
          <MoreMenu>{menu}</MoreMenu>
        </div>
      </section>
    );
  }
  const canOrderPart = partner && (status === "en_progreso" || status === "pendiente_piezas");
  if (step === "cancel") {
    body = <CancelForm order={order} payments={payments} onCancel={() => setStep("idle")} onDone={onChanged} />;
  } else if (step === "reject") {
    body = (
      <ReasonForm
        label="Por qué no procede la garantía"
        placeholder="Golpe en la pantalla nueva"
        submit="Marcar «no procede»"
        saving={saving}
        onCancel={() => setStep("idle")}
        onSubmit={async (reason) => {
          if (await patch({ warrantyRejectedReason: reason })) setStep("idle");
        }}
      />
    );
  } else if (step === "part") {
    body = (
      <PartOrderForm
        orderId={order.id}
        movesStatus={status !== "pendiente_piezas"}
        onCancel={() => setStep("idle")}
        onDone={() => {
          setStep("idle");
          partsChanged();
        }}
      />
    );
  } else if (step === "idle") {
    // A delivered order is not cancelled: its money goes back with a refund.
    const owed = Number(order.balance) > 0;
    const row = (
      <div className={styles.actionRow}>
        {body}
        {onCharge && owed && (
          <Button icon={<Banknote size={16} aria-hidden />} onClick={onCharge}>
            Cobrar
          </Button>
        )}
        <MoreMenu>
          {menu}
          {canOrderPart && (
            <button type="button" className={styles.menuItem} onClick={() => setStep("part")}>
              {ordered?.length ? "Pedir otra pieza…" : "Pedir pieza…"}
            </button>
          )}
          {/* Design R2 «Garantía no procede»: the claim is not covered, the work is charged as usual. */}
          {order.warrantyOfId &&
            (order.warrantyRejectedReason ? (
              <button type="button" className={styles.menuItem} onClick={() => void patch({ warrantyRejectedReason: null })}>
                La garantía sí procede
              </button>
            ) : (
              <button type="button" className={styles.menuItem} onClick={() => setStep("reject")}>
                Garantía no procede…
              </button>
            ))}
          <button type="button" className={`${styles.menuItem} ${styles.menuDanger}`} onClick={() => setStep("cancel")}>
            Cancelar orden…
          </button>
        </MoreMenu>
      </div>
    );
    body = row;
  }

  return (
    <section className={styles.next} aria-label="Siguiente paso">
      {body}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

/** A short form that only asks for a required reason. */
function ReasonForm({
  label,
  placeholder,
  submit,
  saving,
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder: string;
  submit: string;
  saving: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim() && !saving) onSubmit(reason.trim());
  };
  return (
    <form
      className={styles.finish}
      onSubmit={send}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      aria-label={submit}
    >
      <label className={styles.label} htmlFor="reason-form">
        {label}
      </label>
      <input
        id="reason-form"
        className={styles.input}
        value={reason}
        maxLength={300}
        autoFocus
        placeholder={placeholder}
        onChange={(e) => setReason(e.target.value)}
      />
      <p className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          loading={saving}
          disabledReason={reason.trim() ? undefined : "Escribe el motivo."}
        >
          {submit}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Volver
        </Button>
      </p>
    </form>
  );
}

/** «⋯»: the order's less frequent actions. Esc and a click outside close it. */
function MoreMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);
  return (
    <div
      className={styles.more}
      ref={wrap}
      onKeyDown={(e) => {
        // Esc closes the menu, not the panel.
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <Button
        variant="secondary"
        aria-label="Más acciones"
        aria-expanded={open}
        aria-controls={id}
        icon={<MoreHorizontal size={16} aria-hidden />}
        onClick={() => setOpen((o) => !o)}
      />
      <div id={id} className={styles.menu} hidden={!open} onClick={() => setOpen(false)}>
        {children}
      </div>
    </div>
  );
}
