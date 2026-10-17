"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { display } from "~~/components/natichain/fonts";
import { useLibro } from "~~/components/natichain/libro";
import type { Mov } from "~~/components/natichain/libro";
import { Pagina, Revela, Skeleton } from "~~/components/natichain/ui";
import { CONTRATO, EXPLORER, corta, hace, mon } from "~~/components/natichain/utils";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const URL_CODIGO = `${EXPLORER}/address/${CONTRATO}?tab=Contract`;

const HACE = [
  "Guarda la plata de cada natillera en el contrato, no en la cuenta de una persona.",
  "Solo deja aportar a los miembros, y exactamente el valor de la cuota.",
  "Después del cierre, deja que cada miembro retire lo que aportó más su parte de las penalidades.",
  "Permite una salida por calamidad antes del cierre: quien sale recibe el 90% de lo suyo y el 10% queda para los que siguen.",
  "Registra cada movimiento como un evento público que cualquiera puede leer.",
];

const NADIE = [
  "No existe ninguna función de administrador para sacar plata: ni nosotros ni el creador de la natillera la tienen.",
  "Nadie puede retirar a su antojo antes del cierre. La única salida anticipada es la de calamidad: cada miembro solo sobre lo suyo y pagando el 10%.",
  "Las reglas (cuota, número de cuotas y fecha de cierre) no se pueden cambiar después de crear la natillera.",
  "Nadie puede retirar la plata de otro: cada quien solo retira lo que aportó.",
];

const FUNCIONES: [string, string][] = [
  [
    "crearNatillera",
    "Crea una natillera nueva con nombre, cuota, número de cuotas y duración. Quien la crea queda como primer miembro.",
  ],
  ["unirse", "Te agrega como miembro de una natillera que todavía está abierta."],
  ["aportar", "Pagas una cuota (el valor exacto) a la alcancía de la natillera."],
  ["retirar", "Después del cierre, retiras lo que aportaste más tu parte de las penalidades."],
  ["salidaEmergencia", "Antes del cierre, sales con el 90% de lo que aportaste; el 10% queda para el grupo."],
  ["aportado", "Consulta cuánto ha aportado una wallet en una natillera."],
  ["esMiembro", "Consulta si una wallet es miembro de una natillera."],
  ["natilleras", "Lee los datos de una natillera: nombre, creador, cuota, cierre, saldo."],
  ["obtenerMiembros", "Lista las wallets que hacen parte de una natillera."],
  ["tiempoRestante", "Segundos que faltan para el cierre (0 si ya cerró)."],
  ["totalNatilleras", "Cuántas natilleras se han creado en total."],
  ["yaSalio", "Consulta si una wallet ya retiró o salió de una natillera."],
  ["PENALIDAD_PCT", "Constante pública: el porcentaje de penalidad por salida de emergencia (10)."],
];

function CopiarBtn({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setOk(true);
      setTimeout(() => setOk(false), 1800);
    } catch {
      /* sin portapapeles: la dirección ya está visible para copiarla a mano */
    }
  };
  return (
    <button type="button" className="nc-btn nc-btn-sm" onClick={copiar}>
      {ok ? <CheckCircleIcon className="nc-ico" /> : <ClipboardDocumentIcon className="nc-ico" />}
      <span aria-live="polite">{ok ? "Copiada" : "Copiar"}</span>
    </button>
  );
}

function textoMov(m: Mov, nombres: Record<string, string>) {
  const quien = <b className="nc-mono">{corta(m.quien)}</b>;
  const nombre = m.nombre ?? nombres[m.id.toString()];
  const nat = nombre ? `«${nombre}»` : `la natillera #${m.id.toString()}`;
  switch (m.tipo) {
    case "NatilleraCreada":
      return (
        <>
          {quien} creó la natillera {nat} con cuota de {mon(m.monto)} MON
        </>
      );
    case "MiembroUnido":
      return (
        <>
          {quien} se unió a {nat}
        </>
      );
    case "Aporte":
      return (
        <>
          {quien} aportó {mon(m.monto)} MON a {nat}
        </>
      );
    case "SalidaEmergencia":
      return (
        <>
          {quien} salió de {nat} con {mon(m.monto)} MON (dejó {mon(m.extra)} MON para el grupo)
        </>
      );
    default:
      return (
        <>
          {quien} retiró {mon(m.monto)} MON de {nat}
          {m.extra && m.extra > 0n ? ` (más ${mon(m.extra)} MON de bono)` : ""}
        </>
      );
  }
}

function LibroDeCuentas() {
  const { movs, nombres, tiempos, ahora, cargando, fallo, llegoAlInicio, masAntiguos } = useLibro();
  const ref = ahora ?? Math.floor(Date.now() / 1000);

  return (
    <div>
      <div aria-live="polite">
        {movs.length === 0 && cargando && (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }} role="status" aria-label="Leyendo la blockchain">
            <Skeleton h={20} />
            <Skeleton h={20} w="85%" />
            <Skeleton h={20} w="92%" />
          </div>
        )}
        {movs.length === 0 && !cargando && !fallo && (
          <p className="nc-muted" style={{ marginTop: 12 }}>
            No encontramos movimientos en los bloques recientes. Cuando alguien cree una natillera o aporte, aparecerá
            aquí.
          </p>
        )}
        <div className="nc-libro">
          {movs.map(m => {
            const ts = tiempos[m.bloque.toString()];
            return (
              <div className="nc-libro-fila" key={m.clave}>
                <span>{textoMov(m, nombres)}</span>
                <span className="nc-muted" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                  {ts !== undefined ? hace(ts, ref) : "…"} ·{" "}
                  <a className="nc-link" href={`${EXPLORER}/tx/${m.hash}`} target="_blank" rel="noreferrer">
                    Ver transacción ↗
                  </a>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {fallo && (
        <div className="nc-aviso" style={{ marginTop: 12 }}>
          <ExclamationTriangleIcon className="nc-ico nc-ico-inline" />
          El servidor de la red no nos dejó leer más historial. Mostramos lo que alcanzamos a leer y los movimientos que
          lleguen mientras tienes esta página abierta.
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {!llegoAlInicio && (
          <button className="nc-btn nc-btn-sm" onClick={() => masAntiguos()} disabled={cargando}>
            {cargando ? "Leyendo la blockchain…" : "Ver movimientos más antiguos"}
          </button>
        )}
        <span className="nc-help" style={{ margin: 0 }}>
          Se lee directo de la blockchain, sin intermediarios. Las horas son las de la red.
        </span>
      </div>
    </div>
  );
}

export default function Confianza() {
  const { data: total } = useScaffoldReadContract({
    contractName: "NatiChain",
    functionName: "totalNatilleras",
    watch: true,
  });
  const probar = total && total > 0n ? `/natillera/${total.toString()}` : "/#crear";

  return (
    <Pagina>
      <div className="nc-wrap" style={{ paddingBottom: 56 }}>
        <section style={{ padding: "44px 0 12px" }}>
          <span className="nc-eyebrow">
            <ShieldCheckIcon className="nc-ico" /> Confianza
          </span>
          <h1 className={`nc-display nc-h1 ${display.className}`}>
            No nos creas, <span className="nc-subrayado">compruébalo</span>
          </h1>
          <p className="nc-lead nc-muted" style={{ fontSize: "1.15rem", maxWidth: "52ch", marginTop: 16 }}>
            Tu plata no queda con nosotros: queda en un contrato público en la blockchain. Cualquiera puede leer su
            código y ver cada movimiento. Aquí te explicamos cómo.
          </p>
        </section>

        <Revela as="section" className="nc-section" style={{ paddingTop: 24 }}>
          <div className="nc-card nc-contrato">
            <h2 className={`nc-h3 ${display.className}`}>El contrato de NatiChain</h2>
            <div className="nc-dir">
              <code>{CONTRATO}</code>
              <CopiarBtn texto={CONTRATO} />
            </div>
            <div>
              <span className="nc-insignia">
                <CheckCircleIcon className="nc-ico" /> Verificado · Full Match · Solidity 0.8.28
              </span>
            </div>
            <p className="nc-muted">
              «Verificado» significa que el código que ves publicado es exactamente el que está funcionando en la red.
            </p>
            <a className="nc-btn nc-btn-barro nc-btn-lg" href={URL_CODIGO} target="_blank" rel="noreferrer">
              <ShieldCheckIcon className="nc-ico" />
              Ver código en MonadVision
            </a>
          </div>
        </Revela>

        <Revela as="section" className="nc-section" style={{ paddingTop: 8 }}>
          <div className="nc-dos">
            <div className="nc-card">
              <h2 className={`nc-h3 ${display.className}`}>Lo que el contrato hace</h2>
              <ul className="nc-lista">
                {HACE.map(t => (
                  <li key={t}>
                    <CheckCircleIcon className="nc-ico nc-ok" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="nc-card nc-card-papel">
              <h2 className={`nc-h3 ${display.className}`}>Lo que nadie puede hacer</h2>
              <ul className="nc-lista">
                {NADIE.map(t => (
                  <li key={t}>
                    <XCircleIcon className="nc-ico nc-no" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Revela>

        <Revela as="section" className="nc-section" style={{ paddingTop: 8 }}>
          <h2 className={`nc-display nc-h2 ${display.className}`}>Verifícalo en 3 pasos</h2>
          <div className="nc-card" style={{ marginTop: 16 }}>
            <ol className="nc-tres">
              <li>
                <b>1</b>
                <span>
                  Abre el contrato en MonadVision:{" "}
                  <a className="nc-link" href={URL_CODIGO} target="_blank" rel="noreferrer">
                    ver código ↗
                  </a>
                  .
                </span>
              </li>
              <li>
                <b>2</b>
                <span>
                  En la pestaña <b>Contract</b> debe decir <b>Verified</b>. Ahí puedes leer el código fuente completo.
                </span>
              </li>
              <li>
                <b>3</b>
                <span>
                  En <b>Read Contract</b> y <b>Write Contract</b> verás solo estas funciones. Ninguna sirve para que
                  alguien saque la plata de otros:
                </span>
              </li>
            </ol>
            <div className="nc-tabla-scroll">
              <table className="nc-tabla">
                <thead>
                  <tr>
                    <th>Nombre técnico</th>
                    <th>Qué hace</th>
                  </tr>
                </thead>
                <tbody>
                  {FUNCIONES.map(([f, d]) => (
                    <tr key={f}>
                      <td>{f}</td>
                      <td>{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Revela>

        <Revela as="section" className="nc-section" style={{ paddingTop: 8 }}>
          <div className="nc-section-head">
            <h2 className={`nc-display nc-h2 ${display.className}`}>Libro de cuentas</h2>
            <span className="nc-muted">Todo lo que ha pasado en el contrato, en vivo</span>
          </div>
          <div className="nc-card nc-card-papel">
            <LibroDeCuentas />
          </div>
        </Revela>

        <Revela as="section" className="nc-section" style={{ paddingTop: 8 }}>
          <div className="nc-card" style={{ display: "grid", gap: 14 }}>
            <h2 className={`nc-h3 ${display.className}`}>Pruébalo tú</h2>
            <p>
              Entra a una natillera, únete, aporta una cuota y luego pulsa <b>«Sacar la plata ahora»</b>. El contrato va
              a rechazarte y verás el sello <b>BLOQUEADO</b>: esa regla vive en el código, no en nuestra palabra.
            </p>
            <div>
              <Link href={probar} className="nc-btn nc-btn-oro nc-btn-lg">
                {total && total > 0n ? "Probar en una natillera" : "Crear una natillera para probar"}
              </Link>
            </div>
          </div>
        </Revela>

        <Revela as="section" className="nc-section" style={{ paddingTop: 8 }}>
          <div className="nc-aviso" role="note">
            <ExclamationTriangleIcon className="nc-ico nc-ico-inline" />
            <b>Seamos honestos:</b> esto es un prototipo en la red de pruebas (testnet) de Monad. El MON de prueba no
            tiene valor real y el contrato no ha tenido una auditoría externa. Que el código sea público te permite
            revisarlo, pero no reemplaza una auditoría profesional.
          </div>
        </Revela>
      </div>
    </Pagina>
  );
}
