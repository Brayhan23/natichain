"use client";

import { useState } from "react";
import { display } from "./fonts";
import { textoFase } from "./tx";
import type { Fase } from "./tx";
import { Modal, Spinner, Tip } from "./ui";
import {
  ESTADOS,
  type Nat,
  type Sol,
  colorDe,
  corta,
  fechaCierre,
  gananciaPrestamo,
  mensajeError,
  mon,
  monSigno,
  pagareIntegro,
  textoPagare,
  totalDevolver,
} from "./utils";
import { formatEther, parseEther } from "viem";
import {
  ArrowTrendingUpIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const C = "NatiChain" as const;

/** Lo que necesitan los botones que envían transacciones (viene de useNatiTx en la página) */
export type TxProps = {
  enviar: (functionName: string, args: readonly unknown[], mensaje: string, value?: bigint) => Promise<unknown>;
  fase: Fase;
  ocupado: boolean;
};

const MOTIVO_OCUPADO = "Hay una transacción en curso: espera a que termine";

/** Estado + etiqueta + clase de la insignia, usando la hora de la cadena */
export function estadoVisible(s: Sol, ahora?: number) {
  const vencidaVotacion = s.estado === 0 && ahora !== undefined && ahora >= Number(s.fechaLimite);
  const idx = vencidaVotacion ? 5 : s.estado;
  const vencidoDesembolso = s.estado === 2 && ahora !== undefined && ahora > Number(s.fechaLimite);
  const clases = [
    "nc-pill-votacion",
    "nc-pill-mora",
    "nc-pill-desemb",
    "nc-pill-abierta",
    "nc-pill-mora",
    "nc-pill-desemb",
  ];
  return {
    idx,
    texto: vencidoDesembolso ? "Desembolsado · vencido" : ESTADOS[idx],
    clase: clases[idx],
    vencidoDesembolso,
  };
}

function useAccion({ enviar, fase }: TxProps) {
  const [accion, setAccion] = useState("");
  const [err, setErr] = useState("");
  async function correr(a: string, fn: () => Promise<unknown>, ok?: () => void) {
    setErr("");
    setAccion(a);
    try {
      await fn();
      ok?.();
    } catch (e) {
      setAccion("");
      setErr(mensajeError(e));
    }
  }
  const etiqueta = (a: string, texto: React.ReactNode) =>
    accion === a && fase !== "idle" ? (
      <>
        {fase === "ok" ? <CheckCircleIcon className="nc-ico" /> : <Spinner />} {textoFase(fase)}
      </>
    ) : (
      texto
    );
  const faseDe = (a: string) => (accion === a && fase !== "idle" ? fase : undefined);
  return { correr, etiqueta, faseDe, err, enviar };
}

function VotoAvatar({ idSol, quien }: { idSol: bigint; quien: `0x${string}` }) {
  const { data: voto } = useScaffoldReadContract({
    contractName: C,
    functionName: "votoDe",
    args: [idSol, quien],
    watch: true,
  });
  if (voto !== 1) return null;
  return (
    <span
      className="nc-avatar nc-avatar-voto"
      style={{ background: colorDe(quien) }}
      title={`${corta(quien)} aprobó`}
    />
  );
}

/** Botón "Declarar mora" para un préstamo desembolsado y vencido */
export function BotonMora({ idSol, tx, tamano = "sm" }: { idSol: bigint; tx: TxProps; tamano?: "sm" | "lg" }) {
  const a = useAccion(tx);
  return (
    <>
      <Tip motivo={tx.ocupado ? MOTIVO_OCUPADO : undefined}>
        <button
          className={`nc-btn nc-btn-${tamano}`}
          data-fase={a.faseDe("mora")}
          disabled={tx.ocupado}
          onClick={() =>
            a.correr("mora", () => tx.enviar("declararMora", [idSol], "La mora quedó registrada. Ya se puede retirar."))
          }
        >
          {a.etiqueta(
            "mora",
            <>
              <ExclamationTriangleIcon className="nc-ico" />
              Declarar mora
            </>,
          )}
        </button>
      </Tip>
      {a.err && (
        <div className="nc-aviso nc-aviso-error" role="alert">
          {a.err}
        </div>
      )}
    </>
  );
}

/** Aviso en la zona de retiro cuando el préstamo activo ya venció: sin declarar la mora, retirar queda bloqueado */
export function AvisoMora({ n, ahora, tx }: { n: Nat; ahora?: number; tx: TxProps }) {
  const { data } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerSolicitud",
    args: [n.prestamoActivo],
    watch: true,
  });
  const s = data as unknown as Sol | undefined;
  if (n.prestamoActivo === 0n || !s || s.estado !== 2 || ahora === undefined || ahora <= Number(s.fechaLimite))
    return null;
  return (
    <div className="nc-aviso" style={{ display: "grid", gap: 10 }}>
      <span>
        <ExclamationTriangleIcon className="nc-ico nc-ico-inline" />
        El préstamo a <b>{s.solicitante}</b> venció sin pagarse completo. Mientras no se declare la mora, nadie puede
        retirar.
      </span>
      <BotonMora idSol={n.prestamoActivo} tx={tx} />
    </div>
  );
}

/** "Por cobrar: X MON prestados a [solicitante], vence F" */
function PorCobrar({ idSol }: { idSol: bigint }) {
  const { data } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerSolicitud",
    args: [idSol],
    watch: true,
  });
  const s = data as unknown as Sol | undefined;
  if (!s) return null;
  return (
    <div className="nc-aviso" style={{ marginTop: 14 }}>
      <ClockIcon className="nc-ico nc-ico-inline" />
      Por cobrar: <b>{mon(s.monto)} MON</b> prestados a <b>{s.solicitante}</b>, vence {fechaCierre(s.fechaLimite)}.
    </div>
  );
}

/** "Tu diciembre": cuánto ahorraste, cuánto ganas y de dónde sale la ganancia */
export function TuDiciembre({
  n,
  mios,
  miValor,
  gananciaEst,
  personal,
}: {
  n: Nat;
  mios: bigint;
  miValor?: bigint;
  gananciaEst?: bigint;
  personal: boolean;
}) {
  const ganancias = n.fondoPenalidades + n.fondoEventos + n.fondoDonaciones + n.fondoIntereses;
  const neto = ganancias - n.perdidas;
  const bps = n.totalAportesActivos > 0n ? (neto * 10000n) / n.totalAportesActivos : 0n;
  const rend = Number(bps) / 100;
  const fuentes = [
    { k: "Préstamos", v: n.fondoIntereses, color: "var(--verde)" },
    { k: "Eventos", v: n.fondoEventos, color: "var(--oro)" },
    { k: "Donaciones", v: n.fondoDonaciones, color: "var(--barro)" },
    { k: "Penalidades", v: n.fondoPenalidades, color: "var(--barro-osc)" },
  ];
  let max = n.perdidas;
  fuentes.forEach(f => (max = f.v > max ? f.v : max));
  const ancho = (v: bigint) => (max > 0n ? `${Number((v * 100n) / max)}%` : "0%");

  return (
    <section className="nc-card nc-dic">
      <h2 className={`nc-h3 ${display.className}`}>
        <ArrowTrendingUpIcon className="nc-ico nc-ico-inline" />
        Tu diciembre
      </h2>

      {personal && (
        <div className="nc-cifras">
          <div>
            <span>Ahorrado</span>
            <b className="nc-mono">{mon(mios)} MON</b>
          </div>
          <div className="nc-cifras-op" aria-hidden>
            +
          </div>
          <div>
            <span>Ganancia estimada</span>
            <b className="nc-mono" style={{ color: (gananciaEst ?? 0n) < 0n ? "var(--rojo)" : undefined }}>
              {gananciaEst === undefined ? "—" : `${monSigno(gananciaEst)} MON`}
            </b>
          </div>
          <div className="nc-cifras-op" aria-hidden>
            =
          </div>
          <div className="nc-cifras-total">
            <span>Total</span>
            <b className="nc-mono">{mon(miValor)} MON</b>
          </div>
        </div>
      )}

      <p style={{ margin: "12px 0 4px" }}>
        Rendimiento del grupo{" "}
        <b className="nc-mono" style={{ color: rend < 0 ? "var(--rojo)" : "var(--verde)" }}>
          {rend > 0 ? "+" : ""}
          {rend.toLocaleString("es-CO", { maximumFractionDigits: 2 })}%
        </b>
      </p>

      <div className="nc-muted" style={{ fontWeight: 600, fontSize: "0.88rem", margin: "14px 0 6px" }}>
        De dónde sale la ganancia
      </div>
      <div className="nc-fuentes">
        {fuentes.map(f => (
          <div className="nc-fuente" key={f.k}>
            <span>{f.k}</span>
            <span className="nc-fuente-barra" aria-hidden>
              <i style={{ width: ancho(f.v), background: f.color }} />
            </span>
            <b className="nc-mono">{mon(f.v)} MON</b>
          </div>
        ))}
        {n.perdidas > 0n && (
          <div className="nc-fuente nc-fuente-mora">
            <span>Préstamos en mora</span>
            <span className="nc-fuente-barra" aria-hidden>
              <i style={{ width: ancho(n.perdidas), background: "var(--rojo)" }} />
            </span>
            <b className="nc-mono">−{mon(n.perdidas)} MON</b>
          </div>
        )}
      </div>

      {n.prestadoPendiente > 0n && n.prestamoActivo > 0n && <PorCobrar idSol={n.prestamoActivo} />}

      <p className="nc-help" style={{ marginTop: 12 }}>
        No es una tasa prometida: crece con la actividad del grupo.
      </p>
    </section>
  );
}

/** Una solicitud de préstamo vista por los socios, con votación */
export function SolicitudDetalle({
  idSol,
  nat,
  miembros,
  address,
  soyAportante,
  ahora,
  tx,
  soloEnVotacion,
}: {
  idSol: bigint;
  nat: Nat;
  miembros: readonly string[];
  address?: string;
  soyAportante: boolean;
  ahora?: number;
  tx: TxProps;
  soloEnVotacion?: boolean;
}) {
  const { data } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerSolicitud",
    args: [idSol],
    watch: true,
  });
  const { data: aFavor } = useScaffoldReadContract({
    contractName: C,
    functionName: "votosAFavor",
    args: [idSol],
    watch: true,
  });
  const { data: miVoto } = useScaffoldReadContract({
    contractName: C,
    functionName: "votoDe",
    args: [idSol, address],
    watch: true,
  });
  const [confirmar, setConfirmar] = useState<null | boolean>(null);
  const a = useAccion(tx);

  const s = data as unknown as Sol | undefined;
  if (!s) return null;
  const est = estadoVisible(s, ahora);
  if (soloEnVotacion && s.estado !== 0) return null;

  const req = Number(nat.aportantesActivos);
  const si = Number(aFavor ?? 0n);
  const pct = req > 0 ? Math.min(100, (si / req) * 100) : 0;
  const integro = pagareIntegro(s, nat.nombre);
  const puedeVotar =
    s.estado === 0 && soyAportante && miVoto === 0 && ahora !== undefined && ahora < Number(s.fechaLimite);

  const votar = (aprueba: boolean) =>
    a.correr(
      aprueba ? "si" : "no",
      () => tx.enviar("votar", [idSol, aprueba], aprueba ? "Aprobaste la solicitud." : "Rechazaste la solicitud."),
      () => setConfirmar(null),
    );

  return (
    <article className="nc-sol">
      <div className="nc-sol-top">
        <div>
          <b className={display.className} style={{ fontSize: "1.1rem" }}>
            {s.solicitante}
          </b>
          <div className="nc-muted" style={{ fontSize: "0.9rem" }}>
            {s.proposito}
          </div>
        </div>
        <span className={`nc-pill ${est.clase}`}>{est.texto}</span>
      </div>

      <dl className="nc-reglas" style={{ marginTop: 12 }}>
        <div>
          <dt>Monto</dt>
          <dd className="nc-mono">{mon(s.monto)} MON</dd>
        </div>
        <div>
          <dt>Retorno</dt>
          <dd className="nc-mono">{Number(s.retornoBps) / 100}%</dd>
        </div>
        <div>
          <dt>El grupo gana</dt>
          <dd className="nc-mono">{mon(gananciaPrestamo(s.monto, s.retornoBps))} MON</dd>
        </div>
        <div>
          <dt>Fecha límite</dt>
          <dd>{fechaCierre(s.fechaLimite)}</dd>
        </div>
      </dl>

      <div className="nc-sol-pagare">
        <span className={integro ? "nc-integro" : "nc-integro nc-integro-mal"}>
          {integro ? <ShieldCheckIcon className="nc-ico" /> : <ExclamationTriangleIcon className="nc-ico" />}
          {integro ? "Pagaré íntegro" : "No coincide"}
        </span>
        <details className="nc-pagare">
          <summary>Ver pagaré</summary>
          <pre>{textoPagare(s, nat.nombre)}</pre>
        </details>
      </div>

      {s.estado === 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="nc-votos-fila">
            <span className="nc-muted" style={{ fontSize: "0.85rem" }}>
              {si} de {req} socios aprobaron
            </span>
            <span className="nc-votos-avatares">
              {miembros.map(m => (
                <VotoAvatar key={m} idSol={idSol} quien={m as `0x${string}`} />
              ))}
            </span>
          </div>
          <div
            className="nc-barra"
            style={{ marginTop: 6 }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={req}
            aria-valuenow={si}
            aria-label="Votos a favor"
          >
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {puedeVotar && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <Tip motivo={tx.ocupado ? MOTIVO_OCUPADO : undefined}>
            <button className="nc-btn nc-btn-verde nc-btn-sm" disabled={tx.ocupado} onClick={() => setConfirmar(true)}>
              <HandThumbUpIcon className="nc-ico" />
              Aprobar
            </button>
          </Tip>
          <Tip motivo={tx.ocupado ? MOTIVO_OCUPADO : undefined}>
            <button className="nc-btn nc-btn-sm" disabled={tx.ocupado} onClick={() => setConfirmar(false)}>
              <HandThumbDownIcon className="nc-ico" />
              Rechazar
            </button>
          </Tip>
        </div>
      )}
      {s.estado === 0 && soyAportante && miVoto !== undefined && miVoto !== 0 && (
        <p className="nc-help">Ya votaste: {miVoto === 1 ? "aprobaste" : "rechazaste"} esta solicitud.</p>
      )}
      {est.vencidoDesembolso && (
        <div style={{ marginTop: 14 }}>
          <BotonMora idSol={idSol} tx={tx} />
        </div>
      )}
      {a.err && confirmar === null && (
        <div className="nc-aviso nc-aviso-error" role="alert" style={{ marginTop: 10 }}>
          {a.err}
        </div>
      )}

      {confirmar !== null && (
        <Modal onClose={() => setConfirmar(null)}>
          {confirmar ? (
            <HandThumbUpIcon className="nc-ico nc-ico-grande" />
          ) : (
            <HandThumbDownIcon className="nc-ico nc-ico-grande" />
          )}
          <h3 className={`nc-h3 ${display.className}`}>
            {confirmar ? "¿Aprobar este préstamo?" : "¿Rechazar este préstamo?"}
          </h3>
          <p className="nc-muted" style={{ margin: "10px 0 6px" }}>
            {confirmar
              ? `Si TODOS aprueban, ${s.solicitante} recibirá ${mon(s.monto)} MON de la alcancía y deberá devolver ${mon(totalDevolver(s.monto, s.retornoBps))} MON.`
              : "Basta un solo rechazo para cerrar la solicitud. No se puede deshacer."}
          </p>
          <p className="nc-help" style={{ marginBottom: 20 }}>
            Tu voto queda registrado en la blockchain.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="nc-btn" onClick={() => setConfirmar(null)}>
              Mejor no
            </button>
            <Tip motivo={tx.ocupado ? MOTIVO_OCUPADO : undefined}>
              <button
                className={`nc-btn ${confirmar ? "nc-btn-verde" : "nc-btn-barro"}`}
                data-fase={a.faseDe(confirmar ? "si" : "no")}
                disabled={tx.ocupado}
                onClick={() => votar(confirmar)}
              >
                {a.etiqueta(confirmar ? "si" : "no", confirmar ? "Sí, aprobar" : "Sí, rechazar")}
              </button>
            </Tip>
          </div>
          {a.err && (
            <div className="nc-aviso nc-aviso-error" role="alert" style={{ marginTop: 14 }}>
              {a.err}
            </div>
          )}
        </Modal>
      )}
    </article>
  );
}

/** Una solicitud mía, en /financiacion: estado, votos y botones Cobrar / Pagar */
export function MiSolicitud({
  idSol,
  address,
  ahora,
  tx,
}: {
  idSol: bigint;
  address?: string;
  ahora?: number;
  tx: TxProps;
}) {
  const { data } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerSolicitud",
    args: [idSol],
    watch: true,
  });
  const s = data as unknown as Sol | undefined;
  const { data: natData } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerNatillera",
    args: [s?.idNat],
    watch: true,
  });
  const { data: aFavor } = useScaffoldReadContract({
    contractName: C,
    functionName: "votosAFavor",
    args: [idSol],
    watch: true,
  });
  const { data: requeridos } = useScaffoldReadContract({
    contractName: C,
    functionName: "votantesRequeridos",
    args: [s?.idNat],
    watch: true,
  });
  const [monto, setMonto] = useState("");
  const a = useAccion(tx);
  const nat = natData as unknown as Nat | undefined;

  if (!s || !nat || s.prestatario.toLowerCase() !== address?.toLowerCase()) return null;
  const est = estadoVisible(s, ahora);
  const total = totalDevolver(s.monto, s.retornoBps);
  const falta = total - s.pagado;
  const si = Number(aFavor ?? 0n);
  const req = Number(requeridos ?? 0n);
  const puedeCobrar = s.estado === 0 && req > 0 && si === req && ahora !== undefined && ahora < Number(s.fechaLimite);
  const puedePagar = s.estado === 2;

  let aPagar: bigint | undefined;
  try {
    aPagar = monto.trim() ? parseEther(monto.replace(",", ".")) : undefined;
  } catch {
    aPagar = undefined;
  }
  const montoValido = aPagar !== undefined && aPagar > 0n && aPagar <= falta;

  return (
    <article className="nc-sol">
      <div className="nc-sol-top">
        <div>
          <b className={display.className} style={{ fontSize: "1.1rem" }}>
            {mon(s.monto)} MON · {nat.nombre}
          </b>
          <div className="nc-muted" style={{ fontSize: "0.9rem" }}>
            {s.proposito}
          </div>
        </div>
        <span className={`nc-pill ${est.clase}`}>{est.texto}</span>
      </div>
      <p className="nc-muted" style={{ marginTop: 8, fontSize: "0.9rem" }}>
        Devuelves {mon(total)} MON antes del {fechaCierre(s.fechaLimite)}.
      </p>

      {s.estado === 0 && (
        <p style={{ marginTop: 8 }}>
          <b>
            {si} de {req}
          </b>{" "}
          socios aprobaron.
          {!puedeCobrar && est.idx === 0 && <span className="nc-muted"> Se presta solo si TODOS aprueban.</span>}
        </p>
      )}

      {puedeCobrar && (
        <div style={{ marginTop: 12 }}>
          <Tip motivo={tx.ocupado ? MOTIVO_OCUPADO : undefined}>
            <button
              className="nc-btn nc-btn-oro"
              data-fase={a.faseDe("cobrar")}
              disabled={tx.ocupado}
              onClick={() =>
                a.correr("cobrar", () => tx.enviar("cobrarPrestamo", [idSol], `Recibiste ${mon(s.monto)} MON.`))
              }
            >
              {a.etiqueta("cobrar", `Cobrar ${mon(s.monto)} MON`)}
            </button>
          </Tip>
        </div>
      )}

      {puedePagar && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div>
            Falta <b className="nc-mono">{mon(falta)} MON</b> de {mon(total)} MON.
          </div>
          <div className="nc-chips">
            <div className="nc-input-group" style={{ maxWidth: 200 }}>
              <input
                className="nc-input nc-mono"
                inputMode="decimal"
                placeholder="Monto"
                aria-label="Monto a pagar en MON"
                value={monto}
                onChange={e => setMonto(e.target.value.replace(/[^0-9.,]/g, ""))}
              />
              <span className="nc-sufijo">MON</span>
            </div>
            <button type="button" className="nc-chip" onClick={() => setMonto(formatEther(falta))}>
              Pagar todo
            </button>
          </div>
          <Tip
            motivo={
              tx.ocupado
                ? MOTIVO_OCUPADO
                : !montoValido
                  ? "Escribe un monto mayor que cero y que no pase lo que falta"
                  : undefined
            }
          >
            <button
              className="nc-btn nc-btn-verde"
              data-fase={a.faseDe("pagar")}
              disabled={tx.ocupado || !montoValido}
              onClick={() =>
                a.correr(
                  "pagar",
                  () => tx.enviar("pagarPrestamo", [idSol], `Pagaste ${mon(aPagar)} MON del préstamo.`, aPagar),
                  () => setMonto(""),
                )
              }
            >
              {a.etiqueta("pagar", "Pagar")}
            </button>
          </Tip>
        </div>
      )}

      {a.err && (
        <div className="nc-aviso nc-aviso-error" role="alert" style={{ marginTop: 10 }}>
          {a.err}
        </div>
      )}
    </article>
  );
}
