"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { body, display } from "./fonts";
import { CONTRATO, EXPLORER, reducirMovimiento } from "./utils";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import "~~/styles/natichain.css";

type Gota = { k: number; i: number; dx: number; rot: number };

/** Alcancía de marrano de barro. `nivel` 0–1 = qué tan llena está. `lluvia` = contador: cada cambio hace caer 5 monedas. */
export function Marrano({
  nivel = 0.35,
  size = 260,
  id = "m",
  lluvia,
}: {
  nivel?: number;
  size?: number;
  id?: string;
  lluvia?: number;
}) {
  const n = Math.min(1, Math.max(0, nivel));
  const top = 168 - n * 112; // altura del "oro" dentro del cuerpo
  const alto = (size * 200) / 240;
  const caida = Math.max(24, ((top - 40) / 200) * alto);
  const moneda = Math.round(size * 0.085);

  const ref = useRef<HTMLDivElement>(null);
  const previo = useRef(lluvia);
  const [gotas, setGotas] = useState<Gota[]>([]);

  useEffect(() => {
    if (lluvia === undefined || lluvia === previo.current) return;
    previo.current = lluvia;
    if (reducirMovimiento()) return;
    const nuevas = Array.from({ length: 5 }, (_, i) => ({
      k: lluvia * 10 + i,
      i,
      dx: (Math.random() - 0.5) * size * 0.16,
      rot: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 260),
    }));
    setGotas(nuevas);
    // un pequeño squash por moneda, cuando llega al oro
    const timers = nuevas.map(g =>
      setTimeout(
        () => {
          ref.current?.animate([{ transform: "scale(1.03)" }, { transform: "scale(1)" }], {
            duration: 240,
            easing: "ease-out",
          });
        },
        g.i * 120 + 620,
      ),
    );
    const fin = setTimeout(() => setGotas([]), 4 * 120 + 1100);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(fin);
    };
  }, [lluvia, size]);

  return (
    <div ref={ref} className="nc-marrano" style={{ width: size, height: alto }}>
      {gotas.map(g => (
        <span
          key={g.k}
          className="nc-gota"
          aria-hidden
          style={
            {
              width: moneda,
              height: moneda,
              left: (118 / 240) * size - moneda / 2,
              top: (28 / 200) * alto,
              animationDelay: `${g.i * 120}ms`,
              "--dx": `${g.dx}px`,
              "--rot": `${g.rot}deg`,
              "--caida": `${caida}px`,
            } as React.CSSProperties
          }
        />
      ))}
      <svg viewBox="0 0 240 200" width={size} height={alto} role="img" aria-label="Alcancía de marrano">
        <defs>
          <clipPath id={`cuerpo-${id}`}>
            <ellipse cx="118" cy="112" rx="88" ry="62" />
          </clipPath>
        </defs>
        {/* sombra en el piso */}
        <ellipse className="nc-marrano-sombra" cx="120" cy="188" rx="86" ry="8" fill="#2b1a12" opacity="0.18" />
        <g className="nc-marrano-flota">
          {/* patas con pezuña */}
          {[62, 92, 140, 168].map(x => (
            <g key={x}>
              <rect x={x} y="150" width="20" height="30" rx="6" fill="#8e3a1c" stroke="#2b1a12" strokeWidth="3" />
              <path d={`M${x + 1.5} 172 h17 v4 q0 4 -4 4 h-9 q-4 0 -4 -4 z`} fill="#2b1a12" />
              <path d={`M${x + 10} 172 v8`} stroke="#fbf3e4" strokeWidth="1.5" opacity="0.55" />
            </g>
          ))}
          {/* cola */}
          <path
            d="M30 104 q-16 -6 -12 -20 q4 -10 12 -2"
            fill="none"
            stroke="#2b1a12"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* moneda asomada en la ranura */}
          <g>
            <ellipse cx="118" cy="43" rx="10" ry="11" fill="#e8a83a" stroke="#2b1a12" strokeWidth="3" />
            <ellipse cx="118" cy="43" rx="5" ry="6" fill="none" stroke="#b87d1e" strokeWidth="2" />
          </g>
          {/* cuerpo */}
          <ellipse cx="118" cy="112" rx="88" ry="62" fill="#c2532b" stroke="#2b1a12" strokeWidth="3" />
          {/* oro adentro (se ve por la "ventana") */}
          <g clipPath={`url(#cuerpo-${id})`}>
            <rect
              x="20"
              y={top}
              width="200"
              height="200"
              fill="#e8a83a"
              opacity="0.9"
              style={{ transition: "y 1.2s cubic-bezier(.3,.8,.3,1)" }}
            />
            <path
              d={`M20 ${top} q25 -8 50 0 t50 0 t50 0 t50 0`}
              fill="#fbe3b0"
              opacity="0.8"
              style={{ transition: "d 1.2s cubic-bezier(.3,.8,.3,1)" }}
            />
          </g>
          <ellipse cx="118" cy="112" rx="88" ry="62" fill="none" stroke="#2b1a12" strokeWidth="3" />
          {/* brillo de barro */}
          <path
            d="M70 72 q20 -14 48 -14"
            fill="none"
            stroke="#f2c9b0"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.7"
          />
          {/* oreja con interior */}
          <path d="M150 58 l14 -26 l10 30 z" fill="#8e3a1c" stroke="#2b1a12" strokeWidth="3" strokeLinejoin="round" />
          <path d="M156 56 l8 -15 l5 17 z" fill="#d9784e" />
          {/* ranura */}
          <rect x="96" y="46" width="44" height="9" rx="4.5" fill="#2b1a12" />
          {/* mejilla rosada */}
          <ellipse cx="180" cy="102" rx="9" ry="6" fill="#f2a7a0" opacity="0.8" />
          {/* hocico */}
          <ellipse cx="204" cy="112" rx="18" ry="22" fill="#d9784e" stroke="#2b1a12" strokeWidth="3" />
          <circle cx="199" cy="105" r="3.5" fill="#2b1a12" />
          <circle cx="199" cy="119" r="3.5" fill="#2b1a12" />
          {/* ojo */}
          <circle cx="170" cy="88" r="5" fill="#2b1a12" />
          <circle cx="171.5" cy="86.5" r="1.6" fill="#fbf3e4" />
          {/* flor paisa */}
          <g transform="translate(78 108)">
            {[0, 72, 144, 216, 288].map(a => (
              <ellipse
                key={a}
                cx="0"
                cy="-9"
                rx="5"
                ry="8"
                fill="#fbf3e4"
                stroke="#2b1a12"
                strokeWidth="2"
                transform={`rotate(${a})`}
              />
            ))}
            <circle r="5" fill="#e8a83a" stroke="#2b1a12" strokeWidth="2" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export function MarranoMini() {
  return (
    <svg viewBox="0 0 48 40" width="38" height="32" aria-hidden>
      <ellipse cx="22" cy="22" rx="17" ry="13" fill="#c2532b" stroke="#2b1a12" strokeWidth="2.5" />
      <ellipse cx="40" cy="22" rx="5" ry="6" fill="#d9784e" stroke="#2b1a12" strokeWidth="2.5" />
      <rect x="15" y="9" width="12" height="3.5" rx="1.75" fill="#2b1a12" />
      <circle cx="31" cy="18" r="1.8" fill="#2b1a12" />
      <rect x="11" y="31" width="5" height="7" rx="2" fill="#8e3a1c" stroke="#2b1a12" strokeWidth="2" />
      <rect x="27" y="31" width="5" height="7" rx="2" fill="#8e3a1c" stroke="#2b1a12" strokeWidth="2" />
    </svg>
  );
}

export function Pagina({ children }: { children: React.ReactNode }) {
  return (
    <div className={`nc-root ${body.className}`}>
      <div className="nc-franja">
        <div className="nc-wrap nc-franja-in">
          <span className="nc-franja-txt">
            <ShieldCheckIcon className="nc-ico" />
            <span>
              Contrato verificado<span className="nc-largo"> en Monad</span>
            </span>
          </span>
          <span className="nc-franja-links">
            <a href={`${EXPLORER}/address/${CONTRATO}?tab=Contract`} target="_blank" rel="noreferrer">
              Ver código ↗
            </a>
            <Link href="/confianza">
              <span className="nc-largo">Cómo comprobarlo</span>
              <span className="nc-corto">Comprobar</span>
            </Link>
          </span>
        </div>
      </div>
      <header className="nc-nav">
        <div className="nc-wrap nc-nav-in">
          <Link href="/" className={`nc-logo ${display.className}`}>
            <MarranoMini />
            <span>
              NatiChain
              <small className={body.className}>La natillera sin tesorero</small>
            </span>
          </Link>
          <nav className="nc-nav-links">
            <Link href="/#como" className="nc-hide-sm">
              Cómo funciona
            </Link>
            <Link href="/#natilleras" className="nc-hide-sm">
              Natilleras
            </Link>
            <Link href="/financiacion" className="nc-hide-sm">
              Pedir préstamo
            </Link>
            <Link href="/confianza" className="nc-hide-sm">
              Confianza
            </Link>
            <RainbowKitCustomConnectButton />
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="nc-pie">
        <div className="nc-wrap nc-pie-in">
          <span>Prototipo en Monad Testnet · el MON de prueba no tiene valor real.</span>
          <a className="nc-link" href={`${EXPLORER}/address/${CONTRATO}`} target="_blank" rel="noreferrer">
            Ver el contrato verificado ↗
          </a>
        </div>
      </footer>
    </div>
  );
}

export function Spinner() {
  return <span className="nc-spinner" aria-hidden />;
}

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="nc-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="nc-card nc-modal" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** Aparece con fade + translateY la primera vez que entra a la pantalla */
export function Revela({
  children,
  className = "",
  as: Tag = "div",
  id,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
  id?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visto, setVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisto(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisto(true);
          io.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as any} id={id} style={style} className={`nc-revela ${visto ? "nc-revela-in" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

/** Esqueleto tipo papel mientras carga */
export function Skeleton({
  w = "100%",
  h = 16,
  style,
}: {
  w?: number | string;
  h?: number;
  style?: React.CSSProperties;
}) {
  return <span className="nc-skel" aria-hidden style={{ width: w, height: h, ...style }} />;
}

/** Muestra el motivo cuando un botón está deshabilitado */
export function Tip({ motivo, children, block }: { motivo?: string; children: React.ReactNode; block?: boolean }) {
  return (
    <span className={block ? "nc-tip nc-tip-block" : "nc-tip"} title={motivo || undefined}>
      {children}
    </span>
  );
}

/** Confeti dorado en CSS puro */
export function Confeti() {
  const colores = ["#e8a83a", "#c2532b", "#fbe3b0", "#2f6b4f", "#e8a83a"];
  return (
    <div className="nc-confeti" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${(i * 37) % 100}%`,
              background: colores[i % colores.length],
              animationDelay: `${(i % 9) * 90}ms`,
              animationDuration: `${1700 + ((i * 131) % 900)}ms`,
              "--giro": `${(i % 2 ? 1 : -1) * (240 + ((i * 53) % 360))}deg`,
              "--vaiven": `${((i % 5) - 2) * 18}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
