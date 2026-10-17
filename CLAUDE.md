# NatiChain — contexto para Claude Code

Natillera en blockchain (Monad Testnet, Chain ID 10143). Lema: "La natillera donde nadie se vuela con la plata."
Hackathon de Medellín, equipo de 3. Stack: Scaffold-ETH 2 (Hardhat) + Next.js. Interfaz y mensajes en español colombiano, sin jerga técnica.

## Reglas de trabajo (leer siempre)
- Cambia SOLO lo que pide el prompt. No reescribas archivos completos ni quites comportamiento que ya funciona.
- Antes de tocar la interfaz lee `packages/nextjs/DISENO.md`: no cambies paleta, fuentes, bordes, sombras ni layout. Sin emojis; iconos con `@heroicons/react/24/outline`. Clases nuevas con prefijo `nc-` en `styles/natichain.css`. Animaciones respetan `prefers-reduced-motion`.
- NUNCA despliegues contratos (el deploy pide contraseña y lo hace el usuario). NUNCA leas, imprimas ni subas `.env` ni claves.
- No cambies firmas ni eventos del contrato sin avisar: el frontend depende de ellos.
- Termina siempre con `yarn next:check-types` (frontend) o `yarn hardhat:test` (contrato) y resume en máximo 8 líneas.
- No hagas commit salvo que se pida.

## Contrato (`packages/hardhat/contracts/NatiChain.sol`)
- `pragma solidity 0.8.28` exacto, EVM `prague`, optimizer OFF, sin viaIR (para verificar en MonadVision). Sin imports. Pesa ~27 KB: cabe en Monad (límite 128 KB). `allowUnlimitedContractSize` solo en la red local `hardhat`.
- Sin roles de admin: nadie puede sacar plata ajena ni antes del cierre. Las ganancias entran antes del cierre y se reparten al cierre en proporción a lo aportado.
- Fuentes de ganancia: préstamos aprobados por el grupo (intereses), eventos, donaciones y penalidades (10% de quien sale antes).
- Préstamos (empresas, personas o socios): se aprueban SOLO por unanimidad de los aportantes activos; tope 50% del saldo; un préstamo activo a la vez; fecha límite antes del cierre; `hashGarantia` = hash del pagaré (demostración, ficticio).
- Mientras haya préstamo activo: `unirse` y `salidaEmergencia` bloqueados; `retirar` se bloquea hasta pagar o declarar mora.
- El último aportante activo no puede salir antes del cierre si hay fondos de terceros (boletas o donaciones). Regla agregada en la última revisión: confirmar en el contrato.
- Límites conocidos (decididos, no cambiar): reparto proporcional al capital y no al tiempo; cualquier wallet puede solicitar préstamos (defensa: unanimidad).
- Pruebas: `yarn hardhat:test` (incluye `NatiChainSeguridad.ts` y `contracts/mocks/Atacante.sol`, solo para tests).

### API v2
```
crearNatillera(nombre, cuota, numCuotas, duracionSegundos) → id
unirse(id) · aportar(id) payable · donar(id) payable · salidaEmergencia(id) · retirar(id)
crearEvento(idNat, tipo, titulo, lugar, fecha, precio, cupo, soloMiembros) → idEvento    [solo el creador]
inscribirse(idEvento) payable
solicitarPrestamo(idNat, monto, retornoBps, fechaLimite, solicitante, proposito, hashGarantia) → idSol
votar(idSol, aprueba) · cobrarPrestamo(idSol) · pagarPrestamo(idSol) payable · declararMora(idSol)
Lecturas: obtenerNatillera(id) [natilleras es internal] · obtenerMiembros · tiempoRestante · ganancias · valor(id,addr)
 gananciaEstimada(id,addr) int256 · obtenerEvento · eventosDe · inscritosDe · inscrito
 obtenerSolicitud (estado 0 EnVotacion, 1 Rechazada, 2 Desembolsado, 3 Pagado, 4 EnMora, 5 Vencida)
 solicitudesDe · votoDe(idSol,addr) 0/1/2 · votosAFavor · votantesRequeridos
Públicos: esMiembro, aportado, yaSalio, totalNatilleras, totalEventos, totalSolicitudes, PENALIDAD_PCT=10, MAX_MIEMBROS=50, TOPE_PRESTAMO_PCT=50
```
Si algo difiere, la fuente de verdad es el contrato y `packages/nextjs/contracts/deployedContracts.ts` (se regenera al desplegar). La dirección del contrato sale de `useDeployedContractInfo`, no de constantes.

## Frontend (`packages/nextjs`)
- Páginas: `app/page.tsx` (inicio, crear, lista), `app/natillera/[id]/page.tsx` (detalle), `app/confianza/page.tsx` ("No nos creas, compruébalo"). Pendiente de v2: `app/financiacion/page.tsx` (pedir préstamo), solicitudes y votación en el detalle, eventos, donar, tarjeta "Tu diciembre".
- Componentes en `components/natichain/` (`ui.tsx` con el Marrano y Pagina, `CrearNatillera.tsx`, `utils.ts`, `fonts.ts`). Estilos en `styles/natichain.css`.
- `scaffold.config.ts`: `targetNetworks: [chains.monadTestnet]`, `pollingInterval: 4000`.

## Comportamiento protegido (NO romper)
- "Sacar la plata ahora" antes del cierre muestra el modal BLOQUEADO SIN abrir MetaMask (simulación previa; `mensajeError` detecta "Aun no es fecha de cierre").
- La cuenta regresiva y "abierta/cerrada" usan la hora de la cadena (no `Date.now()` del PC).
- Tras cada transacción se invalidan las queries: el saldo se actualiza sin recargar.
- El marrano se llena de oro según el saldo; llueven monedas desde la ranura al aportar (yo o cualquier wallet, por el evento `Aporte`).
- Banner superior con "Ver código" y "Cómo comprobarlo", página `/confianza` y "Confianza" en el navbar.
- Errores traducidos a español con `mensajeError`; botones con estados "Esperando tu firma" → "Confirmando en Monad".
- Nada de emojis en la interfaz.

## Comandos
```
yarn hardhat:compile · yarn hardhat:test · yarn next:check-types · yarn start
yarn deploy --network monadTestnet        (lo corre el usuario; --reset si reutiliza despliegue)
yarn hardhat:hardhat-verify --network monadTestnet <DIRECCION>
```
