"use client";

import { useState } from "react";
import { display } from "./fonts";
import { type TxProps, useAccion } from "./prestamos";
import { Modal, Skeleton, Tip } from "./ui";
import { type Nat, corta, fechaCierre, mon } from "./utils";
import { parseEther } from "viem";
import { useReadContracts } from "wagmi";
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  HeartIcon,
  MapIcon,
  MapPinIcon,
  PlusIcon,
  ShoppingBagIcon,
  SparklesIcon,
  Squares2X2Icon,
  TicketIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const C = "NatiChain" as const;
const MOTIVO_OCUPADO = "Hay una transacción en curso: espera a que termine";

export const TIPOS = [
  { nombre: "Bingo", Icono: Squares2X2Icon },
  { nombre: "Rifa", Icono: TicketIcon },
  { nombre: "Paseo", Icono: MapIcon },
  { nombre: "Venta", Icono: ShoppingBagIcon },
  { nombre: "Otro", Icono: SparklesIcon },
];

export type Evento = {
  idNat: bigint;
  tipo: number;
  titulo: string;
  lugar: string;
  fecha: bigint;
  precio: bigint;
  cupo: bigint;
  inscritos: bigint;
  soloMiembros: boolean;
};

const MOTIVO_PRECIO = (e: Evento) => (e.precio === 0n ? "Gratis" : `${mon(e.precio)} MON`);

/** Fecha en formato datetime-local (hora local del navegador) */
const aLocal = (ts: number) => {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Cuántos eventos próximos tiene una natillera (para las tarjetas del inicio) */
export function useEventosProximos(idNat: bigint, ahora?: number) {
  const { data: info } = useDeployedContractInfo({ contractName: C });
  const { data: ids } = useScaffoldReadContract({
    contractName: C,
    functionName: "eventosDe",
    args: [idNat],
    watch: true,
  });
  const { data } = useReadContracts({
    contracts: (ids ?? []).map(i => ({
      address: info?.address,
      abi: info?.abi,
      functionName: "obtenerEvento",
      args: [i],
    })) as any,
    query: { enabled: !!info && !!ids && ids.length > 0 },
  });
  if (ahora === undefined) return 0;
  return (data ?? []).filter((r: any) => r.status === "success" && Number(r.result.fecha) > ahora).length;
}

function Inscritos({ idEvento }: { idEvento: bigint }) {
  const { data } = useScaffoldReadContract({
    contractName: C,
    functionName: "inscritosDe",
    args: [idEvento],
    watch: true,
  });
  if (!data || data.length === 0) return null;
  return (
    <details className="nc-pagare" style={{ marginTop: 10 }}>
      <summary>
        <UserGroupIcon className="nc-ico nc-ico-inline" />
        Inscritos ({data.length})
      </summary>
      <ul className="nc-inscritos">
        {data.map(a => (
          <li key={a} className="nc-mono">
            <a
              className="nc-link"
              href={`https://testnet.monadvision.com/address/${a}`}
              target="_blank"
              rel="noreferrer"
            >
              {corta(a)}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function EventoTarjeta({
  idEvento,
  nat,
  address,
  soyAportante,
  ahora,
  tx,
}: {
  idEvento: bigint;
  nat: Nat;
  address?: string;
  soyAportante: boolean;
  ahora?: number;
  tx: TxProps;
}) {
  const { data } = useScaffoldReadContract({
    contractName: C,
    functionName: "obtenerEvento",
    args: [idEvento],
    watch: true,
  });
  const { data: yaInscrito } = useScaffoldReadContract({
    contractName: C,
    functionName: "inscrito",
    args: [idEvento, address],
    watch: true,
  });
  const a = useAccion(tx);
  const e = data as unknown as Evento | undefined;
  if (!e)
    return (
      <div className="nc-evento">
        <Skeleton h={90} />
      </div>
    );

  const { Icono, nombre } = TIPOS[Math.min(e.tipo, 4)];
  const cerrado = ahora !== undefined && ahora >= Number(e.fecha);
  const agotado = e.inscritos >= e.cupo;
  const pct = e.cupo > 0n ? Math.min(100, Number((e.inscritos * 100n) / e.cupo)) : 0;

  let texto = `Inscribirme · ${e.precio === 0n ? "Gratis" : `${mon(e.precio)} MON`}`;
  let motivo: string | undefined;
  let deshabilitado = false;
  if (yaInscrito) {
    texto = "Inscrito";
    deshabilitado = true;
  } else if (cerrado) {
    texto = "Cerrado";
    deshabilitado = true;
    motivo = "El evento ya pasó";
  } else if (agotado) {
    texto = "Agotado";
    deshabilitado = true;
    motivo = "No quedan cupos";
  } else if (e.soloMiembros && !soyAportante) {
    texto = "Solo para socios";
    deshabilitado = true;
    motivo = "Solo pueden inscribirse los socios que ya aportaron";
  } else if (!address) {
    deshabilitado = true;
    motivo = "Conecta tu wallet";
  } else if (nat.aportantesActivos === 0n) {
    deshabilitado = true;
    motivo = "Aún no hay socios que hayan aportado";
  } else if (tx.ocupado) {
    deshabilitado = true;
    motivo = MOTIVO_OCUPADO;
  }

  return (
    <article className="nc-evento">
      <div className="nc-evento-top">
        <span className="nc-evento-tipo">
          <Icono className="nc-ico" /> {nombre}
        </span>
        <span className="nc-pill nc-pill-desemb">{e.soloMiembros ? "Solo socios" : "Abierto a todos"}</span>
      </div>
      <b className={display.className} style={{ fontSize: "1.1rem", display: "block", marginTop: 8 }}>
        {e.titulo}
      </b>
      <div className="nc-muted" style={{ fontSize: "0.88rem", display: "grid", gap: 2, marginTop: 4 }}>
        <span>
          <MapPinIcon className="nc-ico nc-ico-inline" />
          {e.lugar}
        </span>
        <span>
          <CalendarDaysIcon className="nc-ico nc-ico-inline" />
          {fechaCierre(e.fecha)}
        </span>
      </div>
      <div style={{ marginTop: 10, fontWeight: 700 }} className="nc-mono">
        {MOTIVO_PRECIO(e)}
      </div>
      <div
        className="nc-barra"
        style={{ marginTop: 8 }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Number(e.cupo)}
        aria-valuenow={Number(e.inscritos)}
        aria-label="Cupos usados"
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="nc-muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
        {e.inscritos.toString()} de {e.cupo.toString()} cupos
      </div>
      <div style={{ marginTop: 12 }}>
        <Tip block motivo={deshabilitado ? motivo : undefined}>
          <button
            className={`nc-btn nc-btn-sm nc-btn-block ${yaInscrito ? "nc-btn-verde" : "nc-btn-oro"}`}
            data-fase={a.faseDe("inscribir")}
            disabled={deshabilitado}
            onClick={() =>
              a.correr("inscribir", () =>
                tx.enviar("inscribirse", [idEvento], `Quedaste inscrito en «${e.titulo}».`, e.precio),
              )
            }
          >
            {a.etiqueta(
              "inscribir",
              yaInscrito ? (
                <>
                  <CheckCircleIcon className="nc-ico" />
                  {texto}
                </>
              ) : (
                texto
              ),
            )}
          </button>
        </Tip>
      </div>
      {a.err && (
        <div className="nc-aviso nc-aviso-error" role="alert" style={{ marginTop: 10 }}>
          {a.err}
        </div>
      )}
      <Inscritos idEvento={idEvento} />
    </article>
  );
}

function CrearEvento({
  id,
  nat,
  ahora,
  tx,
  onClose,
}: {
  id: bigint;
  nat: Nat;
  ahora?: number;
  tx: TxProps;
  onClose: () => void;
}) {
  const [tipo, setTipo] = useState(0);
  const [titulo, setTitulo] = useState("");
  const [lugar, setLugar] = useState("");
  const [fecha, setFecha] = useState("");
  const [precio, setPrecio] = useState("0");
  const [cupo, setCupo] = useState("20");
  const [solo, setSolo] = useState(false);
  const a = useAccion(tx);

  let precioWei: bigint | undefined;
  try {
    precioWei = precio.trim() ? parseEther(precio.replace(",", ".")) : 0n;
  } catch {
    precioWei = undefined;
  }
  const ts = fecha ? Math.floor(new Date(fecha).getTime() / 1000) : 0;
  const cupoNum = Number(cupo);
  let problema: string | undefined;
  if (!titulo.trim() || !lugar.trim()) problema = "Escribe el título y el lugar";
  else if (!ts || ahora === undefined || ts <= ahora || ts >= Number(nat.cierre))
    problema = "Elige una fecha futura y antes del cierre de la natillera";
  else if (precioWei === undefined) problema = "El precio no es válido";
  else if (!Number.isInteger(cupoNum) || cupoNum <= 0) problema = "El cupo debe ser al menos 1";
  const motivo = tx.ocupado ? MOTIVO_OCUPADO : problema;

  return (
    <Modal onClose={onClose}>
      <div style={{ textAlign: "left", display: "grid", gap: 14 }}>
        <h3 className={`nc-h3 ${display.className}`}>Crear evento</h3>
        <div>
          <span className="nc-label">Tipo</span>
          <div className="nc-chips">
            {TIPOS.map((t, i) => (
              <button
                type="button"
                key={t.nombre}
                className="nc-chip"
                aria-pressed={tipo === i}
                onClick={() => setTipo(i)}
              >
                {t.nombre}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="nc-label" htmlFor="ev-titulo">
            Título
          </label>
          <input
            id="ev-titulo"
            className="nc-input"
            maxLength={60}
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
          />
        </div>
        <div>
          <label className="nc-label" htmlFor="ev-lugar">
            Lugar
          </label>
          <input
            id="ev-lugar"
            className="nc-input"
            maxLength={60}
            value={lugar}
            onChange={e => setLugar(e.target.value)}
          />
        </div>
        <div>
          <label className="nc-label" htmlFor="ev-fecha">
            Fecha y hora
          </label>
          <input
            id="ev-fecha"
            type="datetime-local"
            className="nc-input"
            min={ahora ? aLocal(ahora + 120) : undefined}
            max={aLocal(Number(nat.cierre) - 60)}
            value={fecha}
            onChange={e => setFecha(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="nc-label" htmlFor="ev-precio">
              Precio (0 = gratis)
            </label>
            <div className="nc-input-group">
              <input
                id="ev-precio"
                className="nc-input nc-mono"
                inputMode="decimal"
                value={precio}
                onChange={e => setPrecio(e.target.value.replace(/[^0-9.,]/g, ""))}
              />
              <span className="nc-sufijo">MON</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label className="nc-label" htmlFor="ev-cupo">
              Cupo
            </label>
            <input
              id="ev-cupo"
              className="nc-input nc-mono"
              inputMode="numeric"
              value={cupo}
              onChange={e => setCupo(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
        </div>
        <label className="nc-check">
          <input type="checkbox" checked={solo} onChange={e => setSolo(e.target.checked)} />
          <span>Solo para socios</span>
        </label>
        <p className="nc-help">
          La plata de las inscripciones se queda en la natillera y se reparte entre los socios al cierre. El juego se
          organiza por fuera y debe cumplir la norma: las rifas y los bingos con premios están regulados en Colombia.
        </p>
        {a.err && (
          <div className="nc-aviso nc-aviso-error" role="alert">
            {a.err}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="nc-btn" onClick={onClose}>
            Cancelar
          </button>
          <Tip motivo={motivo}>
            <button
              className="nc-btn nc-btn-barro"
              data-fase={a.faseDe("crear")}
              disabled={!!motivo}
              onClick={() =>
                a.correr(
                  "crear",
                  () =>
                    tx.enviar(
                      "crearEvento",
                      [id, tipo, titulo.trim(), lugar.trim(), BigInt(ts), precioWei ?? 0n, BigInt(cupoNum), solo],
                      "Tu evento ya está publicado.",
                    ),
                  onClose,
                )
              }
            >
              {a.etiqueta("crear", "Publicar evento")}
            </button>
          </Tip>
        </div>
      </div>
    </Modal>
  );
}

/** Sección "Eventos" del detalle */
export function SeccionEventos({
  id,
  nat,
  address,
  soyAportante,
  ahora,
  tx,
}: {
  id: bigint;
  nat: Nat;
  address?: string;
  soyAportante: boolean;
  ahora?: number;
  tx: TxProps;
}) {
  const { data: ids } = useScaffoldReadContract({
    contractName: C,
    functionName: "eventosDe",
    args: [id],
    watch: true,
  });
  const [crear, setCrear] = useState(false);
  const soyCreador = !!address && address.toLowerCase() === nat.creador.toLowerCase();
  const cerrada = ahora !== undefined && ahora >= Number(nat.cierre);
  const lista = [...(ids ?? [])].reverse();

  return (
    <>
      <div className="nc-section-head" style={{ marginBottom: 8 }}>
        <h2 className={`nc-h3 ${display.className}`}>
          <TicketIcon className="nc-ico nc-ico-inline" />
          Eventos
        </h2>
        {soyCreador && !cerrada && (
          <button className="nc-btn nc-btn-sm" onClick={() => setCrear(true)}>
            <PlusIcon className="nc-ico" />
            Crear evento
          </button>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="nc-muted">
          Todavía no hay eventos. {soyCreador ? "Crea el primero para recaudar entre todos." : ""}
        </p>
      ) : (
        <div className="nc-eventos">
          {lista.map(i => (
            <EventoTarjeta
              key={i.toString()}
              idEvento={i}
              nat={nat}
              address={address}
              soyAportante={soyAportante}
              ahora={ahora}
              tx={tx}
            />
          ))}
        </div>
      )}
      <p className="nc-help" style={{ marginTop: 12 }}>
        La plata de las inscripciones se queda en la natillera y se reparte entre los socios al cierre. El juego se
        organiza por fuera y debe cumplir la norma: las rifas y los bingos con premios están regulados en Colombia.
      </p>
      {crear && <CrearEvento id={id} nat={nat} ahora={ahora} tx={tx} onClose={() => setCrear(false)} />}
    </>
  );
}

/** "Apoyar esta natillera": donar MON, visible para cualquiera */
export function Apoyar({
  id,
  nat,
  isConnected,
  ahora,
  tx,
}: {
  id: bigint;
  nat: Nat;
  isConnected: boolean;
  ahora?: number;
  tx: TxProps;
}) {
  const [monto, setMonto] = useState("");
  const a = useAccion(tx);
  let wei: bigint | undefined;
  try {
    wei = monto.trim() ? parseEther(monto.replace(",", ".")) : undefined;
  } catch {
    wei = undefined;
  }
  const cerrada = ahora !== undefined && ahora >= Number(nat.cierre);
  const motivo = tx.ocupado
    ? MOTIVO_OCUPADO
    : cerrada
      ? "La natillera ya cerró y no recibe donaciones"
      : nat.aportantesActivos === 0n
        ? "Aún no hay socios que hayan aportado"
        : !wei || wei <= 0n
          ? "Escribe un monto mayor que cero"
          : undefined;

  return (
    <div className="nc-apoyar">
      <h3 className={`nc-h3 ${display.className}`}>
        <HeartIcon className="nc-ico nc-ico-inline" />
        Apoyar esta natillera
      </h3>
      <p className="nc-muted" style={{ fontSize: "0.92rem", margin: "4px 0 10px" }}>
        Cualquiera puede donar MON antes del cierre. Lo donado se reparte entre los socios al cierre, en proporción a lo
        que aportó cada uno.
      </p>
      {isConnected ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="nc-input-group" style={{ flex: "1 1 160px", maxWidth: 220 }}>
            <input
              className="nc-input nc-mono"
              inputMode="decimal"
              placeholder="0.0"
              aria-label="Monto a donar en MON"
              value={monto}
              onChange={e => setMonto(e.target.value.replace(/[^0-9.,]/g, ""))}
            />
            <span className="nc-sufijo">MON</span>
          </div>
          <Tip motivo={motivo}>
            <button
              className="nc-btn nc-btn-oro"
              data-fase={a.faseDe("donar")}
              disabled={!!motivo}
              onClick={() =>
                a.correr(
                  "donar",
                  () => tx.enviar("donar", [id], `Donaste ${mon(wei)} MON. ¡Gracias!`, wei),
                  () => setMonto(""),
                )
              }
            >
              {a.etiqueta("donar", "Apoyar")}
            </button>
          </Tip>
        </div>
      ) : (
        <RainbowKitCustomConnectButton />
      )}
      {a.err && (
        <div className="nc-aviso nc-aviso-error" role="alert" style={{ marginTop: 10 }}>
          {a.err}
        </div>
      )}
    </div>
  );
}
