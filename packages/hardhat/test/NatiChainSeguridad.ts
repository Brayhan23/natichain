import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { NatiChain } from "../typechain-types";

const E = (v: string) => ethers.parseEther(v);
const DIA = 24 * 60 * 60;
const HASH = ethers.id("pagare");
const ID = 1n;

describe("NatiChain v2 - seguridad", function () {
  async function base() {
    const [a, b, c, d, empresa] = await ethers.getSigners();
    const nati = (await (await ethers.getContractFactory("NatiChain")).deploy()) as unknown as NatiChain;
    await nati.connect(a).crearNatillera("Seguridad", E("1"), 3n, 30 * DIA);
    const cierre = (await nati.obtenerNatillera(ID)).cierre;
    return { nati, a, b, c, d, empresa, cierre };
  }
  const saldoContrato = async (n: NatiChain) => ethers.provider.getBalance(await n.getAddress());

  // H1 (Media): al salir el ultimo aportante, los fondos de ganancias/perdidas quedaban "fantasma"
  // y inflaban el valor de quienes aportaban despues -> el primero en retirar le quitaba plata al otro.
  it("H1: tras salir el ultimo aportante no quedan ganancias fantasma para los nuevos", async () => {
    const { nati, a, b, c, d, cierre } = await loadFixture(base);
    for (const s of [b, c, d]) await nati.connect(s).unirse(ID);
    await nati.connect(a).aportar(ID, { value: E("1") });
    await nati.connect(b).aportar(ID, { value: E("1") });
    await nati.connect(b).salidaEmergencia(ID); // deja 0.1 de penalidad
    await nati.connect(a).salidaEmergencia(ID); // ultimo aportante: se lleva todo
    expect(await saldoContrato(nati)).to.equal(0n);

    await nati.connect(c).aportar(ID, { value: E("1") });
    await nati.connect(d).aportar(ID, { value: E("1") });
    await time.increaseTo(cierre);
    await expect(nati.connect(c).retirar(ID)).to.changeEtherBalance(c, E("1"));
    await expect(nati.connect(d).retirar(ID)).to.changeEtherBalance(d, E("1"));
    expect(await saldoContrato(nati)).to.equal(0n);
  });

  describe("H2: reentrancia", () => {
    async function conAtacante(modo: number) {
      const ctx = await base();
      const at = await (await ethers.getContractFactory("Atacante")).deploy(await ctx.nati.getAddress());
      await at.preparar(ID, modo);
      await ctx.nati.connect(ctx.b).unirse(ID);
      await ctx.nati.connect(ctx.b).aportar(ID, { value: E("1") });
      await at.aportar({ value: E("1") });
      return { ...ctx, at };
    }

    it("salidaEmergencia no se puede reentrar", async () => {
      const { nati, at } = await conAtacante(1);
      await at.salir();
      expect(await at.reentroOk()).to.equal(false);
      expect(await at.recibido()).to.equal(E("0.9"));
      expect((await nati.obtenerNatillera(ID)).saldo).to.equal(E("1.1"));
    });

    it("retirar no se puede reentrar", async () => {
      const { nati, at, cierre, b } = await conAtacante(2);
      await time.increaseTo(cierre);
      await at.retirar();
      expect(await at.reentroOk()).to.equal(false);
      expect(await at.recibido()).to.equal(E("1"));
      await expect(nati.connect(b).retirar(ID)).to.changeEtherBalance(b, E("1"));
      expect(await saldoContrato(nati)).to.equal(0n);
    });

    it("aportar durante el envio de la salida tampoco funciona (ya no es miembro activo)", async () => {
      const { at } = await conAtacante(3);
      await ethers.provider.send("hardhat_setBalance", [await at.getAddress(), "0x56BC75E2D63100000"]);
      await at.salir();
      expect(await at.reentroOk()).to.equal(false);
    });
  });

  // H3: gas con MAX_MIEMBROS = 50 (cobrarPrestamo, votosAFavor, votantesRequeridos)
  it("H3: con 50 socios activos el desembolso y las vistas caben holgadamente en gas", async () => {
    const { nati, a, empresa } = await loadFixture(base);
    const socios = [a];
    for (let i = 1; i < 50; i++) {
      const w = ethers.Wallet.createRandom().connect(ethers.provider);
      await a.sendTransaction({ to: w.address, value: E("3") });
      await nati.connect(w).unirse(ID);
      socios.push(w as any);
    }
    for (const s of socios) await nati.connect(s).aportar(ID, { value: E("1") });
    const limite = BigInt((await time.latest()) + 5 * DIA);
    await nati.connect(empresa).solicitarPrestamo(ID, E("10"), 1000n, limite, "Empresa", "Capital", HASH);
    for (const s of socios) await nati.connect(s).votar(1n, true);

    expect(await nati.votantesRequeridos(ID)).to.equal(50n);
    const gasVista = await nati.votosAFavor.estimateGas(1n);
    const tx = await nati.connect(empresa).cobrarPrestamo(1n);
    const gasCobro = (await tx.wait())!.gasUsed;
    console.log(`      gas cobrarPrestamo(50 socios)=${gasCobro}  votosAFavor=${gasVista}`);
    expect(gasCobro).to.be.lt(1_500_000n);
    expect(gasVista).to.be.lt(1_000_000n);
  });

  // H4: declararMora siempre puede desbloquear antes del cierre
  it("H4: con fechaLimite = cierre-1 la mora se puede declarar antes del cierre y desbloquea retirar", async () => {
    const { nati, a, b, c, empresa, cierre } = await loadFixture(base);
    for (const s of [b, c]) await nati.connect(s).unirse(ID);
    for (const s of [a, b, c]) await nati.connect(s).aportar(ID, { value: E("1") });
    const limite = cierre - 20n;
    await nati.connect(empresa).solicitarPrestamo(ID, E("1"), 1000n, limite, "X", "Y", HASH);
    for (const s of [a, b, c]) await nati.connect(s).votar(1n, true);
    await nati.connect(empresa).cobrarPrestamo(1n);

    await time.increaseTo(limite + 2n); // ya vencio, aun no cierra
    expect((await nati.obtenerNatillera(ID)).cierre).to.be.gt(BigInt(await time.latest()));
    await nati.connect(c).declararMora(1n);
    expect((await nati.obtenerNatillera(ID)).prestamoActivo).to.equal(0n);

    await time.increaseTo(cierre);
    for (const s of [a, b, c]) await expect(nati.connect(s).retirar(ID)).to.not.be.reverted;
    expect(await saldoContrato(nati)).to.be.lt(3n);
  });

  it("H5: nadie puede cobrar un prestamo ajeno ni dos veces", async () => {
    const { nati, a, b, empresa } = await loadFixture(base);
    await nati.connect(b).unirse(ID);
    for (const s of [a, b]) await nati.connect(s).aportar(ID, { value: E("1") });
    const limite = BigInt((await time.latest()) + 5 * DIA);
    await nati.connect(empresa).solicitarPrestamo(ID, E("1"), 1000n, limite, "X", "Y", HASH);
    for (const s of [a, b]) await nati.connect(s).votar(1n, true);
    await expect(nati.connect(b).cobrarPrestamo(1n)).to.be.revertedWith("Solo el solicitante");
    await nati.connect(empresa).cobrarPrestamo(1n);
    await expect(nati.connect(empresa).cobrarPrestamo(1n)).to.be.revertedWith("No esta en votacion");
  });

  it("H6: salirse durante la votacion no permite saltarse el voto de los demas", async () => {
    const { nati, a, b, c, empresa } = await loadFixture(base);
    for (const s of [b, c]) await nati.connect(s).unirse(ID);
    for (const s of [a, b, c]) await nati.connect(s).aportar(ID, { value: E("1") });
    const limite = BigInt((await time.latest()) + 5 * DIA);
    await nati.connect(empresa).solicitarPrestamo(ID, E("1"), 1000n, limite, "X", "Y", HASH);
    await nati.connect(a).votar(1n, true);
    await nati.connect(b).votar(1n, true);
    await expect(nati.connect(empresa).cobrarPrestamo(1n)).to.be.revertedWith("Falta unanimidad");
    await nati.connect(c).salidaEmergencia(ID); // c se va: ya no cuenta, pero perdio el 10%
    await expect(nati.connect(empresa).cobrarPrestamo(1n)).to.emit(nati, "PrestamoDesembolsado");
  });

  describe("H7: ultimo aportante y fondos de terceros", () => {
    const MSG = "Hay fondos de terceros: espera al cierre";

    it("(a) un socio + boleta de externo + donacion: no puede salir; al cierre retirar paga todo", async () => {
      const { nati, a, empresa, d, cierre } = await loadFixture(base);
      await nati.connect(a).aportar(ID, { value: E("1") });
      const fecha = BigInt((await time.latest()) + DIA);
      await nati.connect(a).crearEvento(ID, 0, "Bingo", "Salon", fecha, E("0.4"), 5n, false);
      await nati.connect(empresa).inscribirse(1n, { value: E("0.4") });
      await nati.connect(d).donar(ID, { value: E("0.25") });
      await expect(nati.connect(a).salidaEmergencia(ID)).to.be.revertedWith(MSG);
      await time.increaseTo(cierre);
      await expect(nati.connect(a).retirar(ID)).to.changeEtherBalance(a, E("1.65"));
      expect(await saldoContrato(nati)).to.equal(0n);
    });

    it("(b) un socio sin fondos de terceros sale con normalidad", async () => {
      const { nati, a } = await loadFixture(base);
      await nati.connect(a).aportar(ID, { value: E("1") });
      await expect(nati.connect(a).salidaEmergencia(ID)).to.changeEtherBalance(a, E("1"));
      expect(await saldoContrato(nati)).to.equal(0n);
    });

    it("(c) con 2 socios el primero sale normal y el segundo queda bloqueado", async () => {
      const { nati, a, b, empresa, cierre } = await loadFixture(base);
      await nati.connect(b).unirse(ID);
      await nati.connect(a).aportar(ID, { value: E("1") });
      await nati.connect(b).aportar(ID, { value: E("1") });
      await nati.connect(empresa).donar(ID, { value: E("0.5") });
      await expect(nati.connect(b).salidaEmergencia(ID)).to.changeEtherBalance(b, E("0.9"));
      await expect(nati.connect(a).salidaEmergencia(ID)).to.be.revertedWith(MSG);
      await time.increaseTo(cierre);
      await expect(nati.connect(a).retirar(ID)).to.changeEtherBalance(a, E("1.6"));
      expect(await saldoContrato(nati)).to.equal(0n);
    });

    it("(d) invariante: tras resolver todo el balance queda en 0 o polvo", async () => {
      const { nati, a, b, c, empresa, cierre } = await loadFixture(base);
      for (const s of [b, c]) await nati.connect(s).unirse(ID);
      for (const s of [a, b, c]) await nati.connect(s).aportar(ID, { value: E("1") });
      await nati.connect(empresa).donar(ID, { value: 333333n });
      await nati.connect(c).salidaEmergencia(ID);
      await nati.connect(b).salidaEmergencia(ID);
      await expect(nati.connect(a).salidaEmergencia(ID)).to.be.revertedWith(MSG);
      await time.increaseTo(cierre);
      await nati.connect(a).retirar(ID);
      expect(await saldoContrato(nati)).to.be.lt(3n);
    });
  });
});
