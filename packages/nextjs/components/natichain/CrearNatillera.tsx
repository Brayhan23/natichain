"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { display } from "./fonts";
import { textoFase, useNatiTx } from "./tx";
import { Spinner, Tip } from "./ui";
import { mensajeError } from "./utils";
import { parseEther } from "viem";
import { useAccount } from "wagmi";
import {
  CheckCircleIcon,
  DocumentTextIcon,
  LifebuoyIcon,
  LockClosedIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const CUOTAS_RAPIDAS = ["0.01", "0.05", "0.1"];

function segundosHastaDiciembre() {
  const hoy = new Date();
  let dic = new Date(hoy.getFullYear(), 11, 1);
  if (dic <= hoy) dic = new Date(hoy.getFullYear() + 1, 11, 1);
  return Math.floor((dic.getTime() - hoy.getTime()) / 1000);
}

const DURACIONES = [
  { label: "2 min", nota: "demo", seg: () => 120 },
  { label: "10 min", nota: "", seg: () => 600 },
  { label: "1 hora", nota: "", seg: () => 3600 },
  { label: "Hasta diciembre", nota: "", seg: segundosHastaDiciembre },
];

export function CrearNatillera() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const [nombre, setNombre] = useState("");
  const [cuota, setCuota] = useState("0.01");
  const [cuotas, setCuotas] = useState(3);
  const [dur, setDur] = useState(0);
  const [error, setError] = useState("");

  const { enviar, fase, ocupado } = useNatiTx();
  const { refetch: leerTotal } = useScaffoldReadContract({
    contractName: "NatiChain",
    functionName: "totalNatilleras",
  });

  const cuotaValida = Number(cuota) > 0;
  const total = cuotaValida ? (Number(cuota) * cuotas).toLocaleString("es-CO", { maximumFractionDigits: 4 }) : "—";

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nombre.trim()) return setError("Ponle un nombre a tu natillera.");
    if (!cuotaValida) return setError("La cuota debe ser mayor que cero.");
    try {
      await enviar(
        "crearNatillera",
        [nombre.trim(), parseEther(cuota), BigInt(cuotas), BigInt(DURACIONES[dur].seg())],
        "Tu natillera ya existe en la blockchain.",
      );
      const { data } = await leerTotal();
      if (data) router.push(`/natillera/${data.toString()}`);
    } catch (err) {
      setError(mensajeError(err));
    }
  }

  return (
    <div className="nc-crear-grid">
      <form className="nc-card nc-form" onSubmit={crear}>
        <div>
          <label className="nc-label" htmlFor="nombre">
            ¿Cómo se llama la natillera?
          </label>
          <input
            id="nombre"
            className="nc-input"
            placeholder="Ej: Natillera de la cuadra 2026"
            value={nombre}
            maxLength={40}
            onChange={e => setNombre(e.target.value)}
          />
        </div>

        <div>
          <span className="nc-label">Cuota por aporte</span>
          <div className="nc-chips" style={{ marginBottom: 10 }}>
            {CUOTAS_RAPIDAS.map(c => (
              <button type="button" key={c} className="nc-chip" aria-pressed={cuota === c} onClick={() => setCuota(c)}>
                {c} MON
              </button>
            ))}
          </div>
          <div className="nc-input-group">
            <input
              className="nc-input nc-mono"
              inputMode="decimal"
              value={cuota}
              onChange={e => setCuota(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
              aria-label="Cuota en MON"
            />
            <span className="nc-sufijo">MON</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <div>
            <span className="nc-label">¿Cuántas cuotas?</span>
            <div className="nc-stepper">
              <button type="button" onClick={() => setCuotas(c => Math.max(1, c - 1))} aria-label="Menos cuotas">
                −
              </button>
              <output className="nc-mono">{cuotas}</output>
              <button type="button" onClick={() => setCuotas(c => Math.min(24, c + 1))} aria-label="Más cuotas">
                +
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <span className="nc-label">¿Cuándo es &quot;diciembre&quot;?</span>
            <div className="nc-chips">
              {DURACIONES.map((d, i) => (
                <button
                  type="button"
                  key={d.label}
                  className="nc-chip"
                  aria-pressed={dur === i}
                  onClick={() => setDur(i)}
                >
                  {d.label} {d.nota && <small>{d.nota}</small>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div aria-live="assertive">
          {error && (
            <div className="nc-aviso nc-aviso-error" role="alert">
              {error}
            </div>
          )}
        </div>

        {isConnected ? (
          <Tip block motivo={ocupado ? "Hay una transacción en curso: espera a que termine" : undefined}>
            <button className="nc-btn nc-btn-barro nc-btn-lg nc-btn-block" data-fase={fase} disabled={ocupado}>
              {fase === "idle" ? (
                "Crear natillera"
              ) : (
                <>
                  {fase === "ok" ? <CheckCircleIcon className="nc-ico" /> : <Spinner />} {textoFase(fase)}
                </>
              )}
            </button>
          </Tip>
        ) : (
          <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
            <RainbowKitCustomConnectButton />
            <span className="nc-help">Conecta tu wallet para crearla</span>
          </div>
        )}
      </form>

      <aside className="nc-card nc-card-papel" style={{ alignSelf: "start" }}>
        <h3 className={`nc-h3 ${display.className}`}>Así queda tu natillera</h3>
        <div className="nc-resumen" style={{ margin: "14px 0" }}>
          Cada miembro aporta <b>{cuota || "—"} MON</b> hasta <b>{cuotas}</b> {cuotas === 1 ? "vez" : "veces"}: máximo{" "}
          <b>{total} MON</b> por persona.
        </div>
        <ul style={{ display: "grid", gap: 10, paddingLeft: 0, listStyle: "none", fontSize: "0.95rem" }}>
          <li>
            <LockClosedIcon className="nc-ico nc-ico-inline" />
            Nadie puede sacar la plata antes del cierre, <b>ni tú que la creas</b>.
          </li>
          <li>
            <DocumentTextIcon className="nc-ico nc-ico-inline" />
            Estas reglas quedan grabadas y <b>no se pueden cambiar</b>.
          </li>
          <li>
            <LifebuoyIcon className="nc-ico nc-ico-inline" />
            Si alguien tiene una calamidad, sale con el 90% y el 10% queda para el grupo.
          </li>
          <li>
            <SparklesIcon className="nc-ico nc-ico-inline" />
            Al cierre cada quien retira lo suyo, sin pedirle permiso a nadie.
          </li>
        </ul>
      </aside>
    </div>
  );
}
