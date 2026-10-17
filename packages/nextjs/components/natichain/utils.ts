"use client";

import { useEffect, useRef, useState } from "react";
import { formatEther } from "viem";
import { useBlock } from "wagmi";

export const CONTRATO = "0x26A58962d00cF5DfF847C08903f8c30E6419ADd6";
export const EXPLORER = "https://testnet.monadvision.com";

/** Muestra wei como MON legible: 0.01, 1.5, 20 */
export const mon = (v?: bigint) =>
  v === undefined ? "—" : Number(formatEther(v)).toLocaleString("es-CO", { maximumFractionDigits: 4 });

export const corta = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

/** Color estable por dirección, para el avatar de cada miembro */
export const colorDe = (a: string) => {
  const paleta = ["#c2532b", "#e8a83a", "#2f6b4f", "#8e3a1c", "#6b5446", "#d9784e"];
  return paleta[parseInt(a.slice(2, 8), 16) % paleta.length];
};

/** Traduce los errores del contrato y de MetaMask a español de persona */
export function mensajeError(e: unknown): string {
  const x = e as any;
  const t = [
    x?.shortMessage,
    x?.details,
    x?.cause?.reason,
    x?.cause?.shortMessage,
    x?.message,
    typeof e === "string" ? e : "",
  ]
    .filter(Boolean)
    .join(" | ");
  if (/User (rejected|denied)/i.test(t)) return "Cancelaste la firma en MetaMask. No pasó nada.";
  if (t.includes("Aun no es fecha de cierre")) return "BLOQUEADO";
  if (t.includes("La natillera ya cerro")) return "Esta natillera ya cerró: ya no recibe miembros ni aportes.";
  if (t.includes("Ya eres miembro")) return "Ya haces parte de esta natillera.";
  if (t.includes("No eres miembro activo")) return "Primero tienes que unirte a la natillera.";
  if (t.includes("El monto debe ser igual")) return "El aporte debe ser exactamente la cuota.";
  if (t.includes("Ya pagaste todas")) return "¡Ya pagaste todas tus cuotas! Solo queda esperar diciembre.";
  if (t.includes("Nada que retirar")) return "No tienes plata pendiente por retirar en esta natillera.";
  if (/insufficient funds/i.test(t)) return "No tienes suficiente MON en tu wallet.";
  return "Algo salió mal. Revisa tu wallet e inténtalo de nuevo.";
}

/**
 * Segundos que faltan para el cierre, usando la hora de la cadena (block.timestamp) y no la del PC.
 * Al llegar cada bloque se calcula el desfase contra el reloj local y se cuenta cada segundo con él.
 */
export function useFaltan(cierre?: bigint) {
  const { data: block } = useBlock({ watch: true });
  const offset = useRef<number | undefined>(undefined);
  const [ahora, setAhora] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!block) return;
    offset.current = Number(block.timestamp) - Date.now() / 1000;
    setAhora(Math.floor(Date.now() / 1000 + offset.current));
  }, [block]);

  useEffect(() => {
    const t = setInterval(() => {
      if (offset.current !== undefined) setAhora(Math.floor(Date.now() / 1000 + offset.current));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (cierre === undefined || ahora === undefined) return undefined;
  return Math.max(0, Number(cierre) - ahora);
}

export function partes(seg: number) {
  return {
    d: Math.floor(seg / 86400),
    h: Math.floor((seg % 86400) / 3600),
    m: Math.floor((seg % 3600) / 60),
    s: seg % 60,
  };
}

export function textoFaltan(seg?: number) {
  if (seg === undefined) return "…";
  if (seg === 0) return "¡Llegó diciembre!";
  const { d, h, m, s } = partes(seg);
  if (d > 0) return `Faltan ${d} d ${h} h`;
  if (h > 0) return `Faltan ${h} h ${m} min`;
  return `Faltan ${m}:${String(s).padStart(2, "0")}`;
}

export const reducirMovimiento = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Número que sube/baja suavemente hasta `objetivo` cuando cambia (count-up) */
export function useCountUp(objetivo: number, ms = 800) {
  const [valor, setValor] = useState(objetivo);
  const actual = useRef(objetivo);
  useEffect(() => {
    if (reducirMovimiento() || actual.current === objetivo) {
      actual.current = objetivo;
      setValor(objetivo);
      return;
    }
    const desde = actual.current;
    const t0 = performance.now();
    let raf = 0;
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      actual.current = desde + (objetivo - desde) * (1 - Math.pow(1 - p, 3));
      setValor(actual.current);
      if (p < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [objetivo, ms]);
  return valor;
}

export const monNum = (v?: bigint) => (v === undefined ? 0 : Number(formatEther(v)));
export const fmtMon = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 4 });

/** "hace 5 min" calculado contra una hora de referencia (la de la cadena) */
export function hace(ts: number, ahora: number) {
  const d = Math.max(0, ahora - ts);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (d < 45) return "hace unos segundos";
  if (d < 3600) return rtf.format(-Math.round(d / 60), "minute");
  if (d < 86400) return rtf.format(-Math.round(d / 3600), "hour");
  return rtf.format(-Math.round(d / 86400), "day");
}

export const fechaCierre = (cierre?: bigint) =>
  cierre === undefined
    ? "—"
    : new Date(Number(cierre) * 1000).toLocaleString("es-CO", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
