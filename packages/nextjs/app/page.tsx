"use client";

import Link from "next/link";
import {
  ArrowTrendingUpIcon,
  BanknotesIcon,
  EyeIcon,
  LockClosedIcon,
  MapPinIcon,
  SparklesIcon,
  TicketIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { CrearNatillera } from "~~/components/natichain/CrearNatillera";
import { useEventosProximos } from "~~/components/natichain/eventos";
import { display } from "~~/components/natichain/fonts";
import { Marrano, Pagina, Revela, Skeleton } from "~~/components/natichain/ui";
import { mon, textoFaltan, useAhoraCadena, useFaltan } from "~~/components/natichain/utils";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

function TarjetaNatillera({ id }: { id: bigint }) {
  const { data: n } = useScaffoldReadContract({
    contractName: "NatiChain",
    functionName: "obtenerNatillera",
    args: [id],
    watch: true,
  });
  const { data: miembros } = useScaffoldReadContract({
    contractName: "NatiChain",
    functionName: "obtenerMiembros",
    args: [id],
    watch: true,
  });
  const faltan = useFaltan(n?.cierre);
  const ahora = useAhoraCadena();
  const proximos = useEventosProximos(id, ahora);
  if (!n)
    return (
      <div className="nc-nat nc-nat-skel" role="status" aria-label="Cargando natillera">
        <Skeleton w="60%" h={22} />
        <Skeleton w="40%" h={34} />
        <Skeleton h={16} />
      </div>
    );
  const { nombre, cuota, numCuotas, saldo } = n;
  const abierta = faltan !== undefined && faltan > 0;
  const ganancias = n.fondoPenalidades + n.fondoEventos + n.fondoDonaciones + n.fondoIntereses;
  const rendBps = n.totalAportesActivos > 0n ? Number(((ganancias - n.perdidas) * 10000n) / n.totalAportesActivos) : 0;
  const rend = rendBps / 100;
  const cargandoHora = faltan === undefined;

  return (
    <Link href={`/natillera/${id.toString()}`} className="nc-nat">
      <div className="nc-nat-top">
        <b className={display.className} style={{ fontSize: "1.15rem" }}>
          {nombre}
        </b>
        <span className={`nc-pill ${abierta ? "nc-pill-abierta" : "nc-pill-cerrada"}`}>
          {cargandoHora ? (
            "…"
          ) : abierta ? (
            <>
              <i className="nc-dot" /> Abierta
            </>
          ) : (
            <>
              <SparklesIcon className="nc-ico" style={{ width: 15, height: 15 }} /> Cerrada
            </>
          )}
        </span>
      </div>
      <div>
        <div className="nc-muted" style={{ fontSize: "0.82rem" }}>
          Ahorrado
        </div>
        <div className={`nc-nat-saldo nc-mono ${display.className}`}>{mon(saldo)} MON</div>
      </div>
      <div className="nc-nat-etiquetas">
        {n.totalAportesActivos > 0n && (
          <span
            className="nc-pill nc-pill-abierta"
            style={rend < 0 ? { background: "#f6d5cf", color: "var(--rojo)" } : undefined}
          >
            <ArrowTrendingUpIcon className="nc-ico" style={{ width: 15, height: 15 }} />
            {rend > 0 ? "+" : ""}
            {rend.toLocaleString("es-CO", { maximumFractionDigits: 1 })}% rendimiento
          </span>
        )}
        {proximos > 0 && (
          <span className="nc-pill nc-pill-votacion">
            <TicketIcon className="nc-ico" style={{ width: 15, height: 15 }} />
            {proximos} {proximos === 1 ? "evento próximo" : "eventos próximos"}
          </span>
        )}
        {n.prestamoActivo !== 0n && (
          <span className="nc-pill nc-pill-desemb">
            <BanknotesIcon className="nc-ico" style={{ width: 15, height: 15 }} />
            Préstamo activo
          </span>
        )}
      </div>
      <div className="nc-nat-meta">
        <span>
          <UserGroupIcon className="nc-ico nc-ico-inline" />
          {miembros?.length ?? "…"} miembros
        </span>
        <span>
          {mon(cuota)} × {numCuotas.toString()}
        </span>
        <span className="nc-mono">{textoFaltan(faltan)}</span>
      </div>
    </Link>
  );
}

export default function Home() {
  const { data: total } = useScaffoldReadContract({
    contractName: "NatiChain",
    functionName: "totalNatilleras",
    watch: true,
  });
  const ids = total ? Array.from({ length: Number(total) }, (_, i) => total - BigInt(i)) : [];

  return (
    <Pagina>
      <div className="nc-wrap">
        <section className="nc-hero">
          <div>
            <span className="nc-eyebrow">
              <MapPinIcon className="nc-ico" /> Hecho en Medellín · sobre Monad
            </span>
            <h1 className={`nc-display nc-h1 ${display.className}`}>
              La natillera donde <span className="nc-subrayado">nadie se vuela</span> con la plata.
            </h1>
            <p className="nc-lead">
              Ahorren en grupo como siempre, pero sin tesorero: un contrato guarda la plata y nadie la puede sacar antes
              de diciembre. Ni nosotros.
            </p>
            <div className="nc-hero-ctas">
              <a href="#crear" className="nc-btn nc-btn-barro nc-btn-lg">
                Crear mi natillera
              </a>
              <a href="#natilleras" className="nc-btn nc-btn-lg">
                Unirme a una
              </a>
            </div>
          </div>
          <div className="nc-hero-art">
            <Marrano nivel={0.55} size={330} id="hero" />
            <div className="nc-sello nc-sello-1">
              <LockClosedIcon className="nc-ico nc-ico-inline" />
              Reglas que no cambian
              <span>Grabadas en la blockchain</span>
            </div>
            <div className="nc-sello nc-sello-2">
              <EyeIcon className="nc-ico nc-ico-inline" />
              Cuentas claras
              <span>Todos ven cada aporte</span>
            </div>
          </div>
        </section>

        <Revela as="section" id="como" className="nc-section" style={{ paddingTop: 16 }}>
          <h2 className={`nc-display nc-h2 ${display.className}`}>Igualita a la de siempre, pero sin el riesgo</h2>
          <div className="nc-pasos">
            {[
              ["Creen la natillera", "Nombre, cuota y fecha de cierre. Las reglas quedan fijas."],
              ["Únanse", "Cada quien entra con su wallet. Sin papeleo."],
              ["Aporten", "Cada cuota cae a la alcancía y todos la ven al instante."],
              ["Llega diciembre", "Cada uno retira lo suyo. Nadie tiene que entregar nada."],
            ].map(([t, d], i) => (
              <div className="nc-paso" key={t}>
                <b className="nc-num">{i + 1}</b>
                <h3 className={`nc-h3 ${display.className}`}>{t}</h3>
                <p className="nc-muted" style={{ fontSize: "0.95rem", marginTop: 4 }}>
                  {d}
                </p>
              </div>
            ))}
          </div>
        </Revela>

        <Revela as="section" id="crear" className="nc-section">
          <div className="nc-section-head">
            <h2 className={`nc-display nc-h2 ${display.className}`}>Crea tu natillera</h2>
            <span className="nc-muted">Toma menos de un minuto</span>
          </div>
          <CrearNatillera />
        </Revela>

        <Revela as="section" id="natilleras" className="nc-section">
          <div className="nc-section-head">
            <h2 className={`nc-display nc-h2 ${display.className}`}>Natilleras</h2>
            <span className="nc-muted">
              {total !== undefined ? `${total.toString()} en total` : <Skeleton w={90} h={16} />}
            </span>
          </div>
          {total === undefined ? (
            <div className="nc-grid">
              {[0, 1, 2].map(i => (
                <div key={i} className="nc-nat nc-nat-skel" aria-hidden>
                  <Skeleton w="60%" h={22} />
                  <Skeleton w="40%" h={34} />
                  <Skeleton h={16} />
                </div>
              ))}
            </div>
          ) : ids.length === 0 ? (
            <div className="nc-vacio">Todavía no hay natilleras. ¡Crea la primera!</div>
          ) : (
            <div className="nc-grid">
              {ids.map(id => (
                <TarjetaNatillera key={id.toString()} id={id} />
              ))}
            </div>
          )}
        </Revela>
      </div>
    </Pagina>
  );
}
