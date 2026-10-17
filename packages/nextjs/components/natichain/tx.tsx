"use client";

import { useCallback, useState } from "react";
import { EXPLORER } from "./utils";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { useDeployedContractInfo, useTargetNetwork } from "~~/hooks/scaffold-eth";

export type Fase = "idle" | "firma" | "confirma" | "ok";

/** Etiqueta del botón según la fase de la transacción */
export const textoFase = (fase: Fase) =>
  fase === "firma" ? "Esperando tu firma" : fase === "confirma" ? "Confirmando en Monad" : "¡Listo!";

/**
 * Envía una transacción a NatiChain mostrando cada fase (firma → confirmación → listo),
 * refresca las lecturas y avisa con un toast que enlaza a la transacción.
 */
export function useNatiTx() {
  const { data: info } = useDeployedContractInfo({ contractName: "NatiChain" });
  const { targetNetwork } = useTargetNetwork();
  const { chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const queryClient = useQueryClient();
  const [fase, setFase] = useState<Fase>("idle");

  const enviar = useCallback(
    async (functionName: string, args: readonly unknown[], mensaje: string, value?: bigint) => {
      if (!info) throw new Error("Contrato no disponible");
      setFase("firma");
      try {
        if (chainId !== targetNetwork.id) await switchChainAsync({ chainId: targetNetwork.id });
        const hash = await writeContractAsync({
          abi: info.abi,
          address: info.address,
          functionName,
          args,
          value,
          chainId: targetNetwork.id,
        } as any);
        setFase("confirma");
        const rec = await publicClient?.waitForTransactionReceipt({ hash });
        if (rec && rec.status !== "success") throw new Error("La transacción falló");
        await queryClient.invalidateQueries();
        setFase("ok");
        setTimeout(() => setFase("idle"), 1600);
        toast.success(
          <span>
            {mensaje}{" "}
            <a
              href={`${EXPLORER}/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#8e3a1c", fontWeight: 700 }}
            >
              Ver transacción ↗
            </a>
          </span>,
          {
            duration: 7000,
            style: {
              border: "2px solid #2b1a12",
              background: "#fffaf0",
              color: "#2b1a12",
              boxShadow: "4px 4px 0 #2b1a12",
              borderRadius: 12,
              maxWidth: 420,
            },
            iconTheme: { primary: "#2f6b4f", secondary: "#fffaf0" },
          },
        );
        return hash;
      } catch (e) {
        setFase("idle");
        throw e;
      }
    },
    [info, chainId, targetNetwork.id, switchChainAsync, writeContractAsync, publicClient, queryClient],
  );

  return { enviar, fase, ocupado: fase === "firma" || fase === "confirma" };
}
