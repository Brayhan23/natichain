"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseEventLogs } from "viem";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-eth";

export type Mov = {
  clave: string;
  tipo:
    | "NatilleraCreada"
    | "MiembroUnido"
    | "Aporte"
    | "SalidaEmergencia"
    | "Retiro"
    | "PrestamoSolicitado"
    | "VotoEmitido"
    | "PrestamoRechazado"
    | "PrestamoDesembolsado"
    | "PagoPrestamo"
    | "PrestamoPagado"
    | "PrestamoEnMora"
    | "EventoCreado"
    | "InscripcionEvento"
    | "Donacion";
  idSol?: bigint;
  aprueba?: boolean;
  id: bigint;
  quien: string;
  hash: string;
  bloque: bigint;
  indice: number;
  monto?: bigint;
  extra?: bigint;
  nombre?: string;
  titulo?: string;
};

const TIPOS = [
  "NatilleraCreada",
  "MiembroUnido",
  "Aporte",
  "SalidaEmergencia",
  "Retiro",
  "PrestamoSolicitado",
  "VotoEmitido",
  "PrestamoRechazado",
  "PrestamoDesembolsado",
  "PagoPrestamo",
  "PrestamoPagado",
  "PrestamoEnMora",
  "EventoCreado",
  "InscripcionEvento",
  "Donacion",
];
const MAX_PETICIONES = 120; // por pasada de "ver más"
const OBJETIVO = 25; // movimientos que queremos mostrar por pasada

function aMov(log: any): Mov | undefined {
  if (!TIPOS.includes(log.eventName)) return undefined;
  const a = log.args ?? {};
  const base = {
    clave: `${log.transactionHash}-${log.logIndex}`,
    tipo: log.eventName,
    id: a.id,
    hash: log.transactionHash,
    bloque: log.blockNumber,
    indice: log.logIndex,
  };
  switch (log.eventName) {
    case "NatilleraCreada":
      return { ...base, quien: a.creador, nombre: a.nombre, monto: a.cuota };
    case "MiembroUnido":
      return { ...base, quien: a.miembro };
    case "Aporte":
      return { ...base, quien: a.miembro, monto: a.monto };
    case "SalidaEmergencia":
      return { ...base, quien: a.miembro, monto: a.devuelto, extra: a.penalidad };
    case "Retiro":
      return { ...base, quien: a.miembro, monto: a.pagado };
    case "PrestamoSolicitado":
      return { ...base, id: a.idNat, idSol: a.idSol, quien: a.prestatario, monto: a.monto, extra: a.retornoBps };
    case "VotoEmitido":
      return { ...base, id: 0n, idSol: a.idSol, quien: a.votante, aprueba: a.aprueba };
    case "PrestamoRechazado":
      return { ...base, id: 0n, idSol: a.idSol, quien: a.por };
    case "PrestamoDesembolsado":
      return { ...base, id: a.idNat, idSol: a.idSol, quien: "", monto: a.monto };
    case "PagoPrestamo":
      return { ...base, id: 0n, idSol: a.idSol, quien: a.pagador, monto: a.monto, extra: a.faltante };
    case "PrestamoPagado":
      return { ...base, id: a.idNat, idSol: a.idSol, quien: "", monto: a.retorno };
    case "PrestamoEnMora":
      return { ...base, id: a.idNat, idSol: a.idSol, quien: "", monto: a.pagado, extra: a.perdida };
    case "EventoCreado":
      return {
        ...base,
        id: a.idNat,
        idSol: a.idEvento,
        quien: "",
        nombre: undefined,
        monto: a.precio,
        extra: undefined,
        titulo: a.titulo,
      };
    case "InscripcionEvento":
      return { ...base, id: a.idNat, idSol: a.idEvento, quien: a.quien, monto: a.precio };
    default: // Donacion
      return { ...base, quien: a.donante, monto: a.monto };
  }
}

/**
 * Libro de cuentas: lee los eventos del contrato hacia atrás desde el bloque actual en rangos pequeños
 * (los RPC públicos limitan getLogs) y suma en vivo los que llegan durante la sesión.
 */
export function useLibro() {
  const { targetNetwork } = useTargetNetwork();
  const client = usePublicClient({ chainId: targetNetwork.id });
  const { data: info } = useDeployedContractInfo({ contractName: "NatiChain" });

  const [movs, setMovs] = useState<Mov[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [tiempos, setTiempos] = useState<Record<string, number>>({});
  const [ahora, setAhora] = useState<number>();
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [llegoAlInicio, setLlegoAlInicio] = useState(false);

  const cursor = useRef<bigint | undefined>(undefined); // último bloque que falta por revisar
  const paso = useRef<bigint>(2000n);
  const corriendo = useRef(false);

  const agregar = useCallback((nuevos: Mov[]) => {
    setMovs(prev => {
      const mapa = new Map(prev.map(m => [m.clave, m]));
      nuevos.forEach(m => mapa.set(m.clave, m));
      return [...mapa.values()].sort((a, b) =>
        a.bloque === b.bloque ? b.indice - a.indice : a.bloque < b.bloque ? 1 : -1,
      );
    });
  }, []);

  const escanear = useCallback(async () => {
    if (!client || !info || corriendo.current) return;
    corriendo.current = true;
    setCargando(true);
    let encontrados = 0;
    let peticiones = 0;
    try {
      if (cursor.current === undefined) {
        const ultimo = await client.getBlock();
        cursor.current = ultimo.number;
        setAhora(Number(ultimo.timestamp));
      }
      while (cursor.current! >= 0n && encontrados < OBJETIVO && peticiones < MAX_PETICIONES) {
        const hasta: bigint = cursor.current!;
        const desde: bigint = hasta >= paso.current ? hasta - paso.current + 1n : 0n;
        try {
          const logs = await client.getLogs({ address: info.address, fromBlock: desde, toBlock: hasta });
          const dec = parseEventLogs({ abi: info.abi, logs } as any) as any[];
          const nuevos = dec.map(aMov).filter(Boolean) as Mov[];
          encontrados += nuevos.length;
          if (nuevos.length) agregar(nuevos);
          cursor.current = desde - 1n;
          peticiones++;
          if (desde === 0n) {
            setLlegoAlInicio(true);
            break;
          }
        } catch {
          // límite de rango del RPC: reducir la ventana y reintentar
          if (paso.current <= 100n) throw new Error("rango");
          paso.current = paso.current / 4n < 100n ? 100n : paso.current / 4n;
        }
      }
      setFallo(false);
    } catch {
      setFallo(true);
    } finally {
      corriendo.current = false;
      setCargando(false);
    }
  }, [client, info, agregar]);

  useEffect(() => {
    escanear();
  }, [escanear]);

  // eventos que llegan en vivo durante la sesión
  useWatchContractEvent({
    address: info?.address,
    abi: info?.abi as any,
    chainId: targetNetwork.id,
    onLogs: logs => {
      const nuevos = (logs as any[]).map(aMov).filter(Boolean) as Mov[];
      if (nuevos.length) agregar(nuevos);
    },
  });

  // hora de cada bloque (la de la cadena)
  useEffect(() => {
    if (!client) return;
    const faltan = [...new Set(movs.map(m => m.bloque.toString()))].filter(b => tiempos[b] === undefined).slice(0, 40);
    if (!faltan.length) return;
    let vivo = true;
    Promise.all(
      faltan.map(b =>
        client
          .getBlock({ blockNumber: BigInt(b) })
          .then(bl => [b, Number(bl.timestamp)] as const)
          .catch(() => undefined),
      ),
    ).then(r => {
      if (!vivo) return;
      const add: Record<string, number> = {};
      r.forEach(x => x && (add[x[0]] = x[1]));
      setTiempos(t => ({ ...t, ...add }));
    });
    return () => {
      vivo = false;
    };
  }, [movs, client, tiempos]);

  // nombre de cada natillera mencionada
  useEffect(() => {
    if (!client || !info) return;
    const conocidos = { ...nombres };
    movs.forEach(m => m.nombre && (conocidos[m.id.toString()] = m.nombre));
    const faltan = [...new Set(movs.map(m => m.id.toString()))].filter(i => i !== "0" && conocidos[i] === undefined);
    let vivo = true;
    Promise.all(
      faltan.map(i =>
        client
          .readContract({
            address: info.address,
            abi: info.abi,
            functionName: "obtenerNatillera",
            args: [BigInt(i)],
          } as any)
          .then((r: any) => [i, r.nombre as string] as const)
          .catch(() => undefined),
      ),
    ).then(r => {
      if (!vivo) return;
      r.forEach(x => x && (conocidos[x[0]] = x[1]));
      setNombres(prev => (Object.keys(conocidos).length === Object.keys(prev).length ? prev : conocidos));
    });
    return () => {
      vivo = false;
    };
  }, [movs, client, info]); // eslint-disable-line react-hooks/exhaustive-deps

  return { movs, nombres, tiempos, ahora, cargando, fallo, llegoAlInicio, masAntiguos: escanear };
}
