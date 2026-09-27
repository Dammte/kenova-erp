"use client";

/**
 * PatternLock — componente compartido para capturar el patrón de desbloqueo
 * del dispositivo. Funciona con mouse y táctil (touch).
 *
 * Props:
 *   value    — patrón actual como "1-2-3-6-9" (números del 1 al 9)
 *   onChange — callback al cambiar el patrón
 */

import { useRef, useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

// ── Geometría del canvas ─────────────────────────────────────────────────────
const SZ    = 252;   // tamaño del canvas (px)
const PAD   = 46;    // margen interior
const GAP   = (SZ - PAD * 2) / 2; // distancia entre puntos
const DOT_R = 9;     // radio del punto
const HIT_R = 30;    // radio de detección de toque

const dotPos = (idx: number) => ({
  x: PAD + ((idx - 1) % 3) * GAP,
  y: PAD + Math.floor((idx - 1) / 3) * GAP,
});

// ── Estilos de la capa canvas y su contenedor ────────────────────────────────
const wrapStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1.5px solid #e2e8f0",
  borderRadius: 16,
  padding: 10,
  boxShadow: "0 2px 10px rgba(30,50,90,0.07)",
  display: "inline-block",
};

const canvasStyle: React.CSSProperties = {
  display: "block",
  width: SZ,
  height: SZ,
  cursor: "crosshair",
  touchAction: "none", // previene scroll al dibujar en móvil
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  maxWidth: SZ + 20,
};

export default function PatternLock({ value, onChange }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const selRef     = useRef<number[]>([]);
  const curRef     = useRef({ x: -1, y: -1 });

  // Solo para forzar re-render del texto de estado
  const [dotCount, setDotCount] = useState(0);

  // ── Dibujado ─────────────────────────────────────────────────────────────
  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sel     = selRef.current;
    const cur     = curRef.current;
    const drawing = drawingRef.current;

    ctx.clearRect(0, 0, SZ, SZ);

    // Líneas entre puntos seleccionados
    if (sel.length > 1) {
      ctx.save();
      ctx.lineWidth   = 2.5;
      ctx.strokeStyle = "rgba(79,110,247,0.55)";
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.beginPath();
      const p0 = dotPos(sel[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < sel.length; i++) {
        const p = dotPos(sel[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Línea discontinua desde último punto hasta cursor
    if (drawing && sel.length > 0 && cur.x >= 0) {
      const last = dotPos(sel[sel.length - 1]);
      ctx.save();
      ctx.lineWidth   = 1.5;
      ctx.strokeStyle = "rgba(79,110,247,0.22)";
      ctx.lineCap     = "round";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Puntos
    for (let i = 1; i <= 9; i++) {
      const { x, y } = dotPos(i);
      const active = sel.includes(i);
      const first  = sel[0] === i;

      // Anillo exterior (cuando activo)
      if (active) {
        ctx.beginPath();
        ctx.arc(x, y, DOT_R + 7, 0, Math.PI * 2);
        ctx.fillStyle = first
          ? "rgba(79,110,247,0.14)"
          : "rgba(61,92,227,0.10)";
        ctx.fill();
      }

      // Cuerpo principal del punto
      ctx.beginPath();
      ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = first ? "#4f6ef7" : active ? "#3d5ce3" : "#dde3f0";
      ctx.fill();

      // Punto interior
      ctx.beginPath();
      ctx.arc(x, y, DOT_R * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = active
        ? "rgba(255,255,255,0.88)"
        : "rgba(100,116,139,0.45)";
      ctx.fill();
    }
  };

  // ── Sincronización desde prop externa ────────────────────────────────────
  useEffect(() => {
    if (value) {
      const dots = value
        .split("-")
        .map(Number)
        .filter((n) => n >= 1 && n <= 9);
      selRef.current = dots;
      setDotCount(dots.length);
    } else {
      selRef.current = [];
      setDotCount(0);
    }
    curRef.current = { x: -1, y: -1 };
    requestAnimationFrame(redraw);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dibujo inicial
  useEffect(() => {
    requestAnimationFrame(redraw);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Coordenadas escaladas ─────────────────────────────────────────────────
  const coords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const sx     = SZ / rect.width;
    const sy     = SZ / rect.height;
    if ("touches" in e) {
      const te = e as React.TouchEvent<HTMLCanvasElement>;
      const t  = te.touches[0] ?? te.changedTouches[0];
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
    }
    const me = e as React.MouseEvent<HTMLCanvasElement>;
    return { x: (me.clientX - rect.left) * sx, y: (me.clientY - rect.top) * sy };
  };

  // ── Hit-test ──────────────────────────────────────────────────────────────
  const hit = (x: number, y: number) => {
    for (let i = 1; i <= 9; i++) {
      const p = dotPos(i);
      if (Math.hypot(p.x - x, p.y - y) < HIT_R) return i;
    }
    return null;
  };

  // ── Manejadores de eventos ────────────────────────────────────────────────
  const onStart = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault();
    drawingRef.current = true;
    const { x, y } = coords(e);
    curRef.current   = { x, y };
    const dot = hit(x, y);
    if (dot !== null) {
      selRef.current = [dot];
      setDotCount(1);
      onChange(String(dot));
    }
    redraw();
  };

  const onMove = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault();
    if (!drawingRef.current) return;
    const { x, y } = coords(e);
    curRef.current   = { x, y };
    const dot = hit(x, y);
    if (dot !== null && !selRef.current.includes(dot)) {
      selRef.current = [...selRef.current, dot];
      setDotCount(selRef.current.length);
      onChange(selRef.current.join("-"));
    }
    redraw();
  };

  const onEnd = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    e.preventDefault();
    drawingRef.current  = false;
    curRef.current      = { x: -1, y: -1 };
    redraw();
  };

  const clear = () => {
    selRef.current     = [];
    curRef.current     = { x: -1, y: -1 };
    drawingRef.current = false;
    setDotCount(0);
    onChange("");
    redraw();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={wrapStyle}>
        <canvas
          ref={canvasRef}
          width={SZ}
          height={SZ}
          style={canvasStyle}
          onMouseDown={onStart}
          onMouseMove={onMove}
          onMouseUp={onEnd}
          onMouseLeave={onEnd}
          onTouchStart={onStart}
          onTouchMove={onMove}
          onTouchEnd={onEnd}
        />
      </div>

      <div style={rowStyle}>
        <span
          style={{
            fontSize: 12,
            color: dotCount > 0 ? "#475569" : "#94a3b8",
            fontFamily: "inherit",
          }}
        >
          {dotCount > 0
            ? `${dotCount} punto${dotCount !== 1 ? "s" : ""} — ${selRef.current.join(" › ")}`
            : "Arrastra conectando los puntos en orden"}
        </span>
        {dotCount > 0 && (
          <button
            type="button"
            onClick={clear}
            style={{
              fontSize: 11,
              color: "#94a3b8",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "2px 8px",
              borderRadius: 4,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
          >
            Borrar
          </button>
        )}
      </div>
    </div>
  );
}
