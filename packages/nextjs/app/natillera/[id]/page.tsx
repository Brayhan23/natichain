"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  LifebuoyIcon,
  LinkIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { display } from "~~/components/natichain/fonts";
import { textoFase, useNatiTx } from "~~/components/natichain/tx";
import { Confeti, Marrano, Modal, Pagina, Revela, Skeleton, Spinner, Tip } from "~~/components/natichain/ui";
import {
  CONTRATO,
  EXPLORER,
  colorDe,
  corta,
  fechaCierre,
  fmtMon,
  mensajeError,
  mon,
  monNum,
  partes,
  useCountUp,
  useFaltan,
} from "~~/components/natichain/utils";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";

const C = "NatiChain" as const;

function FilaMiembro({ id, quien, cuota, yo }: { id: bigint; quien: `0x${string}`; cuota: bigint; yo?: string }) {
  const { data: aportado } = useScaffoldReadContract({
    contractName: C,
    functionName: "aportado",
    args: [id, quien],
    watch: true,
  });
  const { data: salio } = useScaffoldReadContract({
    contractName: C,
    functionName: "yaSalio",
    args: [id, quien],
    watch: true,
  });
  const cuotasPagadas = aportado !== undefined && cuota > 0n ? Number(aportado / cuota) : 0;
  return (
    <tr>
      <td>
        <span className="nc-avatar" style={{ background: colorDe(quien) }} />
        <a className="nc-link nc-mono" href={`${EXPLORER}/address/${quien}`} target="_blank" rel="noreferrer">
          {corta(quien)}
        </a>
        {yo?.toLowerCase() === quien.toLowerCase() && <span className="nc-yo">Tú</span>}
      </td>
      <td className="nc-mono">{salio ? "—" : `${mon(aportado)} MON`}</td>
      <td>
        {salio ? (
          <>
            Retiró <CheckCircleIcon className="nc-ico" />
          </>
        ) : (
          `${cuotasPagadas} ${cuotasPagadas === 1 ? "cuota" : "cuotas"}`
        )}
      </td>
    </tr>
  );
}

function Esqueleto() {
  return (
    <Pagina>
      <div className="nc-wrap" style={{ padding: "48px 20px" }} role="status" aria-label="Abriendo la alcancía…">
        <Skeleton w={160} h={22} />
        <div style={{ margin: "16px 0 28px" }}>
          <Skeleton w="min(420px, 80%)" h={46} />
        </div>
        <div className="nc-detalle" style={{ padding: 0 }}>
          <div className="nc-card" style={{ display: "grid", gap: 14, justifyItems: "center" }}>
            <Skeleton w={220} h={180} />
            <Skeleton w={180} h={44} />
            <Skeleton w="70%" h={36} />
            <Skeleton h={14} />
          </div>
          <div className="nc-card" style={{ display: "grid", gap: 14 }}>
            <Skeleton w={140} h={24} />
            <Skeleton h={52} />
            <Skeleton h={52} />
          </div>
        </div>
      </div>
    </Pagina>
  );
}

export default function DetalleNatillera() {
  const params = useParams<{ id: string }>();
  const id = BigInt(params.id ?? "0");
  const { address, isConnected } = useAccount();

  const { data: n } = useScaffoldReadContract({ contractName: C, functionName: "natilleras", args: [id], watch: true });
  const { data: miembros } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerMiembros",
    args: [id],
    watch: true,
  });
  const { data: soyMiembro } = useScaffoldReadContract({
    contractName: C,
    functionName: "esMiembro",
    args: [id, address],
    watch: true,
  });
  const { data: miAporte } = useScaffoldReadContract({
    contractName: C,
    functionName: "aportado",
    args: [id, address],
    watch: true,
  });
  const { data: yaSali } = useScaffoldReadContract({
    contractName: C,
    functionName: "yaSalio",
    args: [id, address],
    watch: true,
  });
  const { enviar, fase, ocupado } = useNatiTx();

  const [accion, setAccion] = useState<string>("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"" | "bloqueado" | "emergencia" | "diciembre">("");
  const [lluvia, setLluvia] = useState(0);
  const [copiado, setCopiado] = useState(false);

  const faltan = useFaltan(n?.[4]);
  const saldoAnimado = useCountUp(monNum(n?.[5]));

  // Cuando OTRA persona aporta a esta natillera, también llueven monedas (pantalla proyectada)
  useScaffoldWatchContractEvent({
    contractName: C,
    eventName: "Aporte",
    onLogs: logs => {
      logs.forEach(l => {
        const a = l.args as { id?: bigint; miembro?: string };
        if (a.id === id && a.miembro?.toLowerCase() !== address?.toLowerCase()) setLluvia(k => k + 1);
      });
    },
  });

  if (!n || faltan === undefined) return <Esqueleto />;

  const [nombre, creador, cuota, numCuotas, cierre, saldo, totalActivos, fondoPen, existe] = n;
  if (!existe) {
    return (
      <Pagina>
        <div className="nc-wrap" style={{ padding: "80px 20px", textAlign: "center" }}>
          Esta natillera no existe.{" "}
          <Link className="nc-link" href="/">
            Volver al inicio
          </Link>
        </div>
      </Pagina>
    );
  }

  const abierta = faltan > 0;
  const nMiembros = miembros?.length ?? 0;
  const meta = cuota * numCuotas * BigInt(Math.max(1, nMiembros));
  const nivel = meta > 0n ? Number((saldo * 1000n) / meta) / 1000 : 0;
  const mios = miAporte ?? 0n;
  const misCuotas = cuota > 0n ? Number(mios / cuota) : 0;
  const completo = misCuotas >= Number(numCuotas);
  const bono = totalActivos > 0n ? (mios * fondoPen) / totalActivos : 0n;
  const t = partes(faltan);
  const ultimoMinuto = abierta && faltan <= 60;
  const motivoOcupado = ocupado ? "Hay una transacción en curso: espera a que termine" : undefined;

  async function ejecutar(nombreAccion: string, fn: () => Promise<unknown>, alTerminar?: () => void) {
    setError("");
    setAccion(nombreAccion);
    try {
      await fn();
      alTerminar?.();
    } catch (e) {
      setAccion("");
      const m = mensajeError(e);
      if (m === "BLOQUEADO") setModal("bloqueado");
      else setError(m);
    }
  }

  const unirse = () => ejecutar("unirse", () => enviar("unirse", [id], "Ya haces parte de la natillera."));
  const aportar = () =>
    ejecutar(
      "aportar",
      () => enviar("aportar", [id], `Aportaste ${mon(cuota)} MON.`, cuota),
      () => setLluvia(k => k + 1),
    );
  const retirar = () =>
    ejecutar(
      "retirar",
      () => enviar("retirar", [id], "Tu plata ya está en tu wallet."),
      () => !abierta && setModal("diciembre"),
    );
  const salir = () =>
    ejecutar(
      "salir",
      () => enviar("salidaEmergencia", [id], "Saliste con el 90% de lo aportado."),
      () => setModal(""),
    );

  function compartir() {
    navigator.clipboard?.writeText(window.location.href);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }

  const cargando = (a: string, texto: React.ReactNode) => {
    if (accion !== a || fase === "idle") return texto;
    return (
      <>
        {fase === "ok" ? <CheckCircleIcon className="nc-ico" /> : <Spinner />} {textoFase(fase)}
      </>
    );
  };
  const faseDe = (a: string) => (accion === a && fase !== "idle" ? fase : undefined);

  return (
    <Pagina>
      <div className="nc-wrap">
        <Link href="/#natilleras" className="nc-volver">
          <ArrowLeftIcon className="nc-ico nc-ico-inline" />
          Todas las natilleras
        </Link>

        <div className="nc-section-head" style={{ marginTop: 14, marginBottom: 0 }}>
          <div>
            <span className={`nc-pill ${abierta ? "nc-pill-abierta" : "nc-pill-cerrada"}`}>
              {abierta ? (
                <>
                  <i className="nc-dot" /> Abierta · recibiendo aportes
                </>
              ) : (
                <>
                  <SparklesIcon className="nc-ico" style={{ width: 15, height: 15 }} /> ¡Llegó diciembre!
                </>
              )}
            </span>
            <h1
              className={`nc-display nc-h1 ${display.className}`}
              style={{ marginTop: 10, fontSize: "clamp(2rem,4.5vw,3rem)" }}
            >
              {nombre}
            </h1>
          </div>
          <button className="nc-btn nc-btn-sm" onClick={compartir}>
            {copiado ? (
              <>
                <CheckCircleIcon className="nc-ico nc-ico-inline" />
                ¡Enlace copiado!
              </>
            ) : (
              <>
                <LinkIcon className="nc-ico nc-ico-inline" />
                Invitar al grupo
              </>
            )}
          </button>
        </div>

        <div className="nc-detalle">
          {/* ---------- La alcancía (lo que se proyecta en el pitch) ---------- */}
          <div style={{ display: "grid", gap: 24 }}>
            <Revela as="section" className="nc-card nc-alcancia">
              <Marrano nivel={nivel} size={250} id="det" lluvia={lluvia} />
              <div className="nc-muted" style={{ fontWeight: 600 }}>
                Plata en la alcancía
              </div>
              <div className={`nc-saldo-grande nc-mono ${display.className}`}>
                <span aria-hidden>{fmtMon(saldoAnimado)}</span>
                <span className="nc-sr" aria-live="polite">
                  {mon(saldo)} MON en la alcancía
                </span>
                <small aria-hidden>MON</small>
              </div>

              {abierta ? (
                <>
                  <div
                    className={`nc-cuenta nc-mono ${ultimoMinuto ? "nc-cuenta-final" : ""}`}
                    role="timer"
                    aria-label="Tiempo para el cierre"
                  >
                    {t.d > 0 && (
                      <div>
                        <b key={t.d} className="nc-dig">
                          {t.d}
                        </b>
                        <span>días</span>
                      </div>
                    )}
                    <div>
                      <b key={t.h} className="nc-dig">
                        {String(t.h).padStart(2, "0")}
                      </b>
                      <span>horas</span>
                    </div>
                    <div>
                      <b key={t.m} className="nc-dig">
                        {String(t.m).padStart(2, "0")}
                      </b>
                      <span>min</span>
                    </div>
                    <div>
                      <b key={t.s} className="nc-dig">
                        {String(t.s).padStart(2, "0")}
                      </b>
                      <span>seg</span>
                    </div>
                  </div>
                  <div className="nc-muted" style={{ fontSize: "0.88rem" }}>
                    para que llegue &quot;diciembre&quot; · cierra el {fechaCierre(cierre)}
                  </div>
                </>
              ) : (
                <div className="nc-aviso nc-aviso-ok" style={{ marginTop: 16 }}>
                  <SparklesIcon className="nc-ico nc-ico-inline" />
                  La natillera cerró. Cada miembro ya puede reclamar lo suyo.
                </div>
              )}

              <div
                className="nc-barra"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min(100, nivel * 100))}
                aria-label="Qué tan llena va la alcancía"
              >
                <i style={{ width: `${Math.min(100, nivel * 100)}%` }} />
              </div>
              <div
                className="nc-muted"
                style={{ fontSize: "0.82rem", marginTop: 6, display: "flex", justifyContent: "space-between" }}
              >
                <span>{Math.round(nivel * 100)}% de la meta</span>
                <span className="nc-mono">Meta: {mon(meta)} MON</span>
              </div>
            </Revela>

            <Revela as="section" className="nc-card">
              <h2 className={`nc-h3 ${display.className}`} style={{ marginBottom: 10 }}>
                <UserGroupIcon className="nc-ico nc-ico-inline" />
                Miembros ({nMiembros})
              </h2>
              <table className="nc-miembros">
                <thead>
                  <tr>
                    <th>Wallet</th>
                    <th>Aportado</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {miembros?.map(m => (
                    <FilaMiembro key={m} id={id} quien={m as `0x${string}`} cuota={cuota} yo={address} />
                  ))}
                </tbody>
              </table>
              <p className="nc-help" style={{ marginTop: 10 }}>
                Cada aporte es una transacción pública: nadie puede decir &quot;yo sí pagué&quot; sin prueba.
              </p>
            </Revela>
          </div>

          {/* ---------- Panel de acciones ---------- */}
          <div style={{ display: "grid", gap: 24, position: "sticky", top: 90 + 36 }}>
            <Revela as="section" className="nc-card nc-panel">
              <h2 className={`nc-h3 ${display.className}`}>Tu natillera</h2>

              {!isConnected ? (
                <>
                  <p className="nc-muted">Conecta tu wallet para unirte o aportar.</p>
                  <RainbowKitCustomConnectButton />
                </>
              ) : !soyMiembro ? (
                abierta ? (
                  <>
                    <p className="nc-muted">
                      Aún no haces parte. Al unirte podrás aportar <b>{mon(cuota)} MON</b> hasta {numCuotas.toString()}{" "}
                      veces.
                    </p>
                    <Tip motivo={motivoOcupado} block>
                      <button
                        className="nc-btn nc-btn-barro nc-btn-lg nc-btn-block"
                        data-fase={faseDe("unirse")}
                        disabled={ocupado}
                        onClick={unirse}
                      >
                        {cargando("unirse", "Unirme a la natillera")}
                      </button>
                    </Tip>
                  </>
                ) : (
                  <div className="nc-aviso">Esta natillera ya cerró y no recibe nuevos miembros.</div>
                )
              ) : yaSali ? (
                <div className="nc-aviso nc-aviso-ok">
                  <CheckCircleIcon className="nc-ico nc-ico-inline" />
                  Ya retiraste tu plata de esta natillera.
                </div>
              ) : abierta ? (
                <>
                  <div>
                    <div className="nc-muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
                      Tus cuotas · {mon(mios)} MON ahorrados
                    </div>
                    <div className="nc-mis-cuotas" style={{ flexWrap: "wrap" }}>
                      {Array.from({ length: Number(numCuotas) }, (_, i) => (
                        <span key={i} className={`nc-moneda ${i < misCuotas ? "llena" : ""}`}>
                          {i + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                  {completo ? (
                    <div className="nc-aviso nc-aviso-ok">¡Pagaste todas tus cuotas! Solo queda esperar diciembre.</div>
                  ) : (
                    <Tip motivo={motivoOcupado} block>
                      <button
                        className="nc-btn nc-btn-oro nc-btn-lg nc-btn-block"
                        data-fase={faseDe("aportar")}
                        disabled={ocupado}
                        onClick={aportar}
                      >
                        {cargando(
                          "aportar",
                          <>
                            <CurrencyDollarIcon className="nc-ico" />
                            Aportar {mon(cuota)} MON
                          </>,
                        )}
                      </button>
                    </Tip>
                  )}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Tip motivo={motivoOcupado}>
                      <button
                        className="nc-btn nc-btn-sm"
                        data-fase={faseDe("retirar")}
                        disabled={ocupado}
                        onClick={retirar}
                      >
                        {cargando("retirar", "Sacar la plata ahora")}
                      </button>
                    </Tip>
                    <Tip motivo={motivoOcupado ?? (mios === 0n ? "Aún no has aportado nada que retirar" : undefined)}>
                      <button
                        className="nc-btn nc-btn-sm nc-btn-ghost"
                        disabled={ocupado || mios === 0n}
                        onClick={() => setModal("emergencia")}
                      >
                        <LifebuoyIcon className="nc-ico" />
                        Tengo una calamidad
                      </button>
                    </Tip>
                  </div>
                </>
              ) : mios > 0n ? (
                <>
                  <p>
                    Tienes <b>{mon(mios + bono)} MON</b> esperándote
                    {bono > 0n && <span className="nc-muted"> (incluye {mon(bono)} de bono por penalidades)</span>}.
                  </p>
                  <Tip motivo={motivoOcupado} block>
                    <button
                      className="nc-btn nc-btn-verde nc-btn-lg nc-btn-block"
                      data-fase={faseDe("retirar")}
                      disabled={ocupado}
                      onClick={retirar}
                    >
                      {cargando(
                        "retirar",
                        <>
                          <SparklesIcon className="nc-ico" />
                          Reclamar mi diciembre
                        </>,
                      )}
                    </button>
                  </Tip>
                </>
              ) : (
                <div className="nc-aviso">No hiciste aportes en esta natillera.</div>
              )}

              <div aria-live="assertive">
                {error && (
                  <div className="nc-aviso nc-aviso-error" role="alert">
                    {error}
                  </div>
                )}
              </div>
            </Revela>

            <Revela as="section" className="nc-card nc-card-papel">
              <h2 className={`nc-h3 ${display.className}`}>
                <DocumentTextIcon className="nc-ico nc-ico-inline" />
                Reglas grabadas en el contrato
              </h2>
              <dl className="nc-reglas">
                <div>
                  <dt>Cuota</dt>
                  <dd className="nc-mono">{mon(cuota)} MON</dd>
                </div>
                <div>
                  <dt>Máximo de cuotas</dt>
                  <dd>{numCuotas.toString()}</dd>
                </div>
                <div>
                  <dt>Cierre</dt>
                  <dd>{fechaCierre(cierre)}</dd>
                </div>
                <div>
                  <dt>Salida anticipada</dt>
                  <dd>Pierde 10% → grupo</dd>
                </div>
                <div>
                  <dt>Creada por</dt>
                  <dd className="nc-mono">{corta(creador)}</dd>
                </div>
                <div>
                  <dt>Puede sacar plata antes</dt>
                  <dd style={{ color: "var(--rojo)" }}>
                    Nadie <LockClosedIcon className="nc-ico" style={{ color: "var(--rojo)" }} />
                  </dd>
                </div>
              </dl>
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <Link href="/confianza" className="nc-btn nc-btn-oro nc-btn-sm nc-btn-block">
                  <ShieldCheckIcon className="nc-ico" />
                  Cómo comprobar que es seguro
                </Link>
                <a
                  className="nc-link"
                  style={{ fontSize: "0.92rem" }}
                  href={`${EXPLORER}/address/${CONTRATO}?tab=Contract`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Revisa el código verificado: no tiene función para que un admin saque plata ↗
                </a>
              </div>
            </Revela>
          </div>
        </div>
      </div>

      {modal === "bloqueado" && (
        <Modal onClose={() => setModal("")}>
          <div className={`nc-estampa ${display.className}`}>BLOQUEADO</div>
          <h3 className={`nc-h3 ${display.className}`}>El contrato no deja sacar la plata antes de diciembre</h3>
          <p className="nc-muted" style={{ margin: "10px 0 20px" }}>
            Ni el creador, ni el &quot;tesorero&quot;, ni nosotros. La regla está en el código y nadie la puede saltar.
          </p>
          <button className="nc-btn nc-btn-barro nc-btn-block" onClick={() => setModal("")}>
            Entendido, mi plata está segura
          </button>
        </Modal>
      )}

      {modal === "emergencia" && (
        <Modal onClose={() => setModal("")}>
          <LifebuoyIcon className="nc-ico nc-ico-grande" />
          <h3 className={`nc-h3 ${display.className}`}>¿Seguro que quieres salir?</h3>
          <p className="nc-muted" style={{ margin: "10px 0 6px" }}>
            Recibes <b style={{ color: "var(--cafe)" }}>{mon((mios * 90n) / 100n)} MON</b> ahora. El 10% (
            {mon(mios / 10n)} MON) se queda para los que siguen ahorrando.
          </p>
          <p className="nc-help" style={{ marginBottom: 20 }}>
            Esta acción no se puede deshacer.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="nc-btn" onClick={() => setModal("")}>
              Mejor no
            </button>
            <Tip motivo={motivoOcupado}>
              <button className="nc-btn nc-btn-barro" data-fase={faseDe("salir")} disabled={ocupado} onClick={salir}>
                {cargando("salir", "Sí, salir con el 90%")}
              </button>
            </Tip>
          </div>
          {error && (
            <div className="nc-aviso nc-aviso-error" role="alert" style={{ marginTop: 14 }}>
              {error}
            </div>
          )}
        </Modal>
      )}

      {modal === "diciembre" && (
        <>
          <Confeti />
          <Modal onClose={() => setModal("")}>
            <SparklesIcon className="nc-ico nc-ico-grande" />
            <h3 className={`nc-h2 ${display.className}`}>¡Feliz diciembre!</h3>
            <p className="nc-muted" style={{ margin: "10px 0 20px" }}>
              Tu plata ya está en tu wallet. Nadie tuvo que entregártela: lo hizo el contrato.
            </p>
            <button className="nc-btn nc-btn-verde nc-btn-block" onClick={() => setModal("")}>
              ¡Qué chimba!
            </button>
          </Modal>
        </>
      )}
    </Pagina>
  );
}
