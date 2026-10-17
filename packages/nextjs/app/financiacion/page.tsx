"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import { BanknotesIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { display } from "~~/components/natichain/fonts";
import { MiSolicitud } from "~~/components/natichain/prestamos";
import { textoFase, useNatiTx } from "~~/components/natichain/tx";
import { Pagina, Revela, Skeleton, Spinner, Tip } from "~~/components/natichain/ui";
import {
  type Nat,
  fechaCierre,
  gananciaPrestamo,
  hashPagare,
  mensajeError,
  mon,
  textoPagare,
  totalDevolver,
  useAhoraCadena,
} from "~~/components/natichain/utils";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const C = "NatiChain" as const;
const RETORNOS = ["2", "5", "10"];

/** Fecha en formato datetime-local (hora local del navegador) */
const aLocal = (ts: number) => {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Opcion({
  id,
  elegida,
  ahora,
  onElegir,
}: {
  id: bigint;
  elegida: boolean;
  ahora?: number;
  onElegir: (id: bigint) => void;
}) {
  const { data } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerNatillera",
    args: [id],
    watch: true,
  });
  const { data: miembros } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerMiembros",
    args: [id],
    watch: true,
  });
  const n = data as unknown as Nat | undefined;
  if (!n)
    return (
      <div className="nc-nat nc-nat-skel" aria-hidden>
        <Skeleton w="60%" h={22} />
        <Skeleton h={16} />
      </div>
    );
  if (ahora !== undefined && ahora >= Number(n.cierre)) return null; // solo natilleras abiertas
  const disponible = n.prestamoActivo !== 0n ? 0n : n.saldo / 2n;
  return (
    <button type="button" className="nc-nat nc-nat-sel" aria-pressed={elegida} onClick={() => onElegir(id)}>
      <div className="nc-nat-top">
        <b className={display.className} style={{ fontSize: "1.1rem" }}>
          {n.nombre}
        </b>
        {elegida && <CheckCircleIcon className="nc-ico" />}
      </div>
      <div>
        <div className="nc-muted" style={{ fontSize: "0.82rem" }}>
          Disponible para prestar
        </div>
        <div className={`nc-nat-saldo nc-mono ${display.className}`} style={{ fontSize: "1.5rem" }}>
          {mon(disponible)} MON
        </div>
        {n.prestamoActivo !== 0n && <div className="nc-help">Hay un préstamo activo: espera a que termine.</div>}
      </div>
      <div className="nc-nat-meta">
        <span>{miembros?.length ?? "…"} socios</span>
        <span>Cierra {fechaCierre(n.cierre)}</span>
      </div>
    </button>
  );
}

export default function Financiacion() {
  const { address, isConnected } = useAccount();
  const ahora = useAhoraCadena();
  const tx = useNatiTx();
  const { data: total } = useScaffoldReadContract({ contractName: C, functionName: "totalNatilleras", watch: true });
  const { data: totalSol } = useScaffoldReadContract({
    contractName: C,
    functionName: "totalSolicitudes",
    watch: true,
  });

  const [sel, setSel] = useState<bigint>();
  const [monto, setMonto] = useState("");
  const [retorno, setRetorno] = useState("5");
  const [limite, setLimite] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [proposito, setProposito] = useState("");
  const [firmado, setFirmado] = useState(false);
  const [error, setError] = useState("");

  const { data: selData } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerNatillera",
    args: [sel],
    watch: true,
  });
  const nat = selData as unknown as Nat | undefined;

  const ids = total ? Array.from({ length: Number(total) }, (_, i) => total - BigInt(i)) : [];
  const idsSol = totalSol ? Array.from({ length: Math.min(30, Number(totalSol)) }, (_, i) => totalSol - BigInt(i)) : [];

  // ---- validación y vista previa
  let montoWei: bigint | undefined;
  try {
    montoWei = monto.trim() ? parseEther(monto.replace(",", ".")) : undefined;
  } catch {
    montoWei = undefined;
  }
  const retornoNum = parseFloat(retorno.replace(",", "."));
  const bps = Number.isFinite(retornoNum) ? Math.round(retornoNum * 100) : 0;
  const limiteTs = limite ? Math.floor(new Date(limite).getTime() / 1000) : 0;
  const disponible = nat ? (nat.prestamoActivo !== 0n ? 0n : nat.saldo / 2n) : 0n;
  const minTs = (ahora ?? 0) + 120;
  const maxTs = nat ? Number(nat.cierre) - 60 : 0;

  const problemas: string[] = [];
  if (!nat) problemas.push("Elige una natillera.");
  else {
    if (ahora !== undefined && ahora >= Number(nat.cierre)) problemas.push("Esa natillera ya cerró.");
    if (nat.prestamoActivo !== 0n) problemas.push("Esa natillera ya tiene un préstamo activo.");
    if (montoWei === undefined || montoWei <= 0n) problemas.push("Escribe un monto mayor que cero.");
    else if (montoWei > disponible)
      problemas.push(`El monto no puede pasar de ${mon(disponible)} MON (50% de la alcancía).`);
    if (bps < 100 || bps > 5000) problemas.push("El retorno debe estar entre 1% y 50%.");
    if (!limiteTs) problemas.push("Elige la fecha límite.");
    else if (ahora !== undefined && (limiteTs <= ahora || limiteTs >= Number(nat.cierre)))
      problemas.push("La fecha límite debe ser futura y antes del cierre de la natillera.");
    if (!solicitante.trim()) problemas.push("Escribe tu nombre o razón social.");
    if (!proposito.trim()) problemas.push("Cuenta para qué es el préstamo.");
  }
  const listo = problemas.length === 0;

  const pagare =
    nat && address && listo
      ? textoPagare(
          {
            prestatario: address,
            monto: montoWei!,
            retornoBps: BigInt(bps),
            fechaLimite: BigInt(limiteTs),
            solicitante: solicitante.trim(),
            proposito: proposito.trim(),
          },
          nat.nombre,
        )
      : undefined;

  const motivoBoton = tx.ocupado
    ? "Hay una transacción en curso: espera a que termine"
    : !isConnected
      ? "Conecta tu wallet"
      : !listo
        ? problemas[0]
        : !firmado
          ? "Marca que leíste y firmas el pagaré"
          : undefined;

  async function enviarSolicitud(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!pagare || !sel || montoWei === undefined) return;
    try {
      await tx.enviar(
        "solicitarPrestamo",
        [sel, montoWei, BigInt(bps), BigInt(limiteTs), solicitante.trim(), proposito.trim(), hashPagare(pagare)],
        "Tu solicitud quedó registrada. Ahora los socios votan.",
      );
      setMonto("");
      setLimite("");
      setProposito("");
      setFirmado(false);
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <Pagina>
      <div className="nc-wrap" style={{ paddingBottom: 56 }}>
        <section style={{ padding: "44px 0 12px" }}>
          <span className="nc-eyebrow">
            <BanknotesIcon className="nc-ico" /> Financiación
          </span>
          <h1 className={`nc-display nc-h1 ${display.className}`}>
            Pide un préstamo a una <span className="nc-subrayado">natillera</span>
          </h1>
          <p className="nc-lead nc-muted" style={{ fontSize: "1.15rem", maxWidth: "56ch", marginTop: 16 }}>
            Para empresas, personas o socios. Los socios votan y el préstamo se desembolsa solo si TODOS aprueban. Lo
            que pagas de retorno queda para el grupo.
          </p>
        </section>

        <Revela as="section" className="nc-section" style={{ paddingTop: 20 }}>
          <div className="nc-section-head">
            <h2 className={`nc-display nc-h2 ${display.className}`}>1. Elige la natillera</h2>
            <span className="nc-muted">Solo las abiertas</span>
          </div>
          {total === undefined ? (
            <div className="nc-grid">
              {[0, 1].map(i => (
                <div key={i} className="nc-nat nc-nat-skel" aria-hidden>
                  <Skeleton w="60%" h={22} />
                  <Skeleton h={16} />
                </div>
              ))}
            </div>
          ) : ids.length === 0 ? (
            <div className="nc-vacio">Todavía no hay natilleras para pedirles un préstamo.</div>
          ) : (
            <div className="nc-grid">
              {ids.map(id => (
                <Opcion key={id.toString()} id={id} elegida={sel === id} ahora={ahora} onElegir={setSel} />
              ))}
            </div>
          )}
        </Revela>

        <Revela as="section" className="nc-section" style={{ paddingTop: 8 }}>
          <div className="nc-section-head">
            <h2 className={`nc-display nc-h2 ${display.className}`}>2. Cuéntanos qué necesitas</h2>
          </div>
          <div className="nc-crear-grid">
            <form className="nc-card nc-form" onSubmit={enviarSolicitud}>
              <div>
                <label className="nc-label" htmlFor="solicitante">
                  Nombre o razón social
                </label>
                <input
                  id="solicitante"
                  className="nc-input"
                  placeholder="Ej: Tienda Doña Rosa SAS"
                  maxLength={60}
                  value={solicitante}
                  onChange={e => setSolicitante(e.target.value)}
                />
              </div>
              <div>
                <label className="nc-label" htmlFor="proposito">
                  ¿Para qué es el préstamo?
                </label>
                <input
                  id="proposito"
                  className="nc-input"
                  placeholder="Ej: Surtir inventario para diciembre"
                  maxLength={120}
                  value={proposito}
                  onChange={e => setProposito(e.target.value)}
                />
              </div>
              <div>
                <label className="nc-label" htmlFor="monto">
                  Monto
                </label>
                <div className="nc-input-group">
                  <input
                    id="monto"
                    className="nc-input nc-mono"
                    inputMode="decimal"
                    value={monto}
                    placeholder="0.0"
                    onChange={e => setMonto(e.target.value.replace(/[^0-9.,]/g, ""))}
                  />
                  <span className="nc-sufijo">MON</span>
                </div>
                {nat && <p className="nc-help">Máximo {mon(disponible)} MON (50% de lo que hay en la alcancía).</p>}
              </div>
              <div>
                <span className="nc-label">Retorno para el grupo</span>
                <div className="nc-chips" style={{ marginBottom: 10 }}>
                  {RETORNOS.map(r => (
                    <button
                      type="button"
                      key={r}
                      className="nc-chip"
                      aria-pressed={retorno === r}
                      onClick={() => setRetorno(r)}
                    >
                      {r}%
                    </button>
                  ))}
                </div>
                <div className="nc-input-group" style={{ maxWidth: 220 }}>
                  <input
                    className="nc-input nc-mono"
                    inputMode="decimal"
                    aria-label="Retorno en porcentaje"
                    value={retorno}
                    onChange={e => setRetorno(e.target.value.replace(/[^0-9.,]/g, ""))}
                  />
                  <span className="nc-sufijo">%</span>
                </div>
                <p className="nc-help">Entre 1% y 50% del monto.</p>
              </div>
              <div>
                <label className="nc-label" htmlFor="limite">
                  Fecha límite para pagar
                </label>
                <input
                  id="limite"
                  type="datetime-local"
                  className="nc-input"
                  min={ahora ? aLocal(minTs) : undefined}
                  max={nat ? aLocal(maxTs) : undefined}
                  value={limite}
                  onChange={e => setLimite(e.target.value)}
                />
                <p className="nc-help">
                  Debe ser antes del cierre de la natillera{nat ? ` (${fechaCierre(nat.cierre)})` : ""}.
                </p>
              </div>

              {montoWei !== undefined && montoWei > 0n && bps >= 100 && bps <= 5000 && (
                <div className="nc-resumen">
                  Devolverás <b>{mon(totalDevolver(montoWei, BigInt(bps)))} MON</b> · La natillera gana{" "}
                  <b>{mon(gananciaPrestamo(montoWei, BigInt(bps)))} MON</b>
                </div>
              )}

              <div>
                <span className="nc-label">Tu pagaré</span>
                {pagare ? (
                  <pre className="nc-pagare-pre">{pagare}</pre>
                ) : (
                  <p className="nc-help">Completa el formulario y aquí verás el pagaré que firmarás.</p>
                )}
              </div>

              <label className="nc-check">
                <input
                  type="checkbox"
                  checked={firmado}
                  disabled={!pagare}
                  onChange={e => setFirmado(e.target.checked)}
                />
                <span>Leí y firmo este pagaré</span>
              </label>

              <div className="nc-aviso" role="note">
                <ExclamationTriangleIcon className="nc-ico nc-ico-inline" />
                Demostración: en producción sería un pagaré electrónico con firma digital. No pongas datos sensibles:
                todo es público.
              </div>

              <div aria-live="assertive">
                {error && (
                  <div className="nc-aviso nc-aviso-error" role="alert">
                    {error}
                  </div>
                )}
              </div>

              {isConnected ? (
                <Tip block motivo={motivoBoton}>
                  <button
                    className="nc-btn nc-btn-barro nc-btn-lg nc-btn-block"
                    data-fase={tx.fase}
                    disabled={!!motivoBoton}
                  >
                    {tx.fase === "idle" ? (
                      "Firmar y pedir el préstamo"
                    ) : (
                      <>
                        {tx.fase === "ok" ? <CheckCircleIcon className="nc-ico" /> : <Spinner />} {textoFase(tx.fase)}
                      </>
                    )}
                  </button>
                </Tip>
              ) : (
                <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                  <RainbowKitCustomConnectButton />
                  <span className="nc-help">Conecta tu wallet para pedirlo</span>
                </div>
              )}
            </form>

            <aside className="nc-card nc-card-papel" style={{ alignSelf: "start" }}>
              <h3 className={`nc-h3 ${display.className}`}>Cómo funciona</h3>
              <ol className="nc-lista-num" style={{ marginTop: 12 }}>
                <li>Pides el préstamo y firmas el pagaré con tu wallet.</li>
                <li>Los socios votan. Un solo rechazo cierra la solicitud.</li>
                <li>Si TODOS aprueban, tú cobras el monto desde esta página.</li>
                <li>Pagas en partes o completo, antes de la fecha límite.</li>
                <li>Si no pagas a tiempo, se registra la mora y el grupo asume la pérdida.</li>
              </ol>
              {problemas.length > 0 && sel !== undefined && (
                <p className="nc-help" style={{ marginTop: 12 }}>
                  Falta: {problemas[0]}
                </p>
              )}
            </aside>
          </div>
        </Revela>

        <Revela as="section" className="nc-section" style={{ paddingTop: 8 }}>
          <div className="nc-section-head">
            <h2 className={`nc-display nc-h2 ${display.className}`}>Mis solicitudes</h2>
            <span className="nc-muted">Estado, votos y pagos</span>
          </div>
          {!isConnected ? (
            <div className="nc-vacio">Conecta tu wallet para ver tus solicitudes.</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {idsSol.map(id => (
                <MiSolicitud key={id.toString()} idSol={id} address={address} ahora={ahora} tx={tx} />
              ))}
              <p className="nc-help">Aquí aparecen los préstamos que has pedido desde esta wallet.</p>
            </div>
          )}
        </Revela>
      </div>
    </Pagina>
  );
}
