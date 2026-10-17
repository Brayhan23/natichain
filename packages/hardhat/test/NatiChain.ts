import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { NatiChain } from "../typechain-types";

const E = (v: string) => ethers.parseEther(v);
const DIA = 24 * 60 * 60;
const HASH = ethers.id("pagare-empresa-001");
const ID = 1n;

describe("NatiChain v2", function () {
  /** 3 socios (A crea, B y C se unen) con 2 cuotas de 1 MON cada uno, y una empresa externa. */
  async function fixture() {
    const [a, b, c, empresa, d] = await ethers.getSigners();
    const nati = (await (await ethers.getContractFactory("NatiChain")).deploy()) as unknown as NatiChain;
    await nati.connect(a).crearNatillera("Natillera de la cuadra", E("1"), 3n, 30 * DIA);
    await nati.connect(b).unirse(ID);
    await nati.connect(c).unirse(ID);
    for (const s of [a, b, c]) {
      await nati.connect(s).aportar(ID, { value: E("1") });
      await nati.connect(s).aportar(ID, { value: E("1") });
    }
    const n = await nati.obtenerNatillera(ID);
    return { nati, a, b, c, empresa, d, cierre: n.cierre };
  }

  async function solicitud(nati: NatiChain, quien: any, monto = E("3"), dias = 10, hash = HASH) {
    const limite = BigInt((await time.latest()) + dias * DIA);
    await nati
      .connect(quien)
      .solicitarPrestamo(ID, monto, 1000n, limite, "Tienda Doña Rosa SAS", "Surtir inventario", hash);
    return { idSol: await nati.totalSolicitudes(), limite };
  }

  async function balance(nati: NatiChain) {
    return ethers.provider.getBalance(await nati.getAddress());
  }

  it("estado inicial: aportantes activos y totales", async () => {
    const { nati } = await loadFixture(fixture);
    const n = await nati.obtenerNatillera(ID);
    expect(n.aportantesActivos).to.equal(3n);
    expect(n.totalAportesActivos).to.equal(E("6"));
    expect(n.saldo).to.equal(E("6"));
  });

  it("flujo completo: evento + donacion + prestamo con retorno + retiros con ganancias", async () => {
    const { nati, a, b, c, empresa, cierre } = await loadFixture(fixture);

    // evento publico, la empresa paga la boleta
    const fecha = BigInt((await time.latest()) + 2 * DIA);
    await nati.connect(a).crearEvento(ID, 0, "Bingo bailable", "Salon comunal", fecha, E("0.5"), 10n, false);
    await expect(nati.connect(empresa).inscribirse(1n, { value: E("0.5") })).to.emit(nati, "InscripcionEvento");
    expect(await nati.inscrito(1n, empresa.address)).to.equal(true);
    expect(await nati.inscritosDe(1n)).to.deep.equal([empresa.address]);
    expect(await nati.eventosDe(ID)).to.deep.equal([1n]);

    // donacion
    await expect(nati.connect(empresa).donar(ID, { value: E("0.3") })).to.emit(nati, "Donacion");

    // prestamo: 3 MON al 10%
    const { idSol } = await solicitud(nati, empresa);
    expect(await nati.votantesRequeridos(ID)).to.equal(3n);
    for (const s of [a, b, c]) await nati.connect(s).votar(idSol, true);
    expect(await nati.votosAFavor(idSol)).to.equal(3n);
    expect(await nati.votoDe(idSol, a.address)).to.equal(1);

    await expect(nati.connect(empresa).cobrarPrestamo(idSol)).to.changeEtherBalance(empresa, E("3"));
    let n = await nati.obtenerNatillera(ID);
    expect(n.prestamoActivo).to.equal(idSol);
    expect(n.prestadoPendiente).to.equal(E("3"));
    expect(n.saldo).to.equal(E("3.8"));

    // pago en dos partes con retorno
    await nati.connect(empresa).pagarPrestamo(idSol, { value: E("2") });
    await expect(nati.connect(empresa).pagarPrestamo(idSol, { value: E("1.4") })).to.be.revertedWith(
      "Pagas mas de lo que falta",
    );
    await expect(nati.connect(empresa).pagarPrestamo(idSol, { value: E("1.3") })).to.emit(nati, "PrestamoPagado");
    n = await nati.obtenerNatillera(ID);
    expect(n.prestamoActivo).to.equal(0n);
    expect(n.fondoIntereses).to.equal(E("0.3"));
    expect(n.saldo).to.equal(E("7.1"));
    expect((await nati.obtenerSolicitud(idSol)).estado).to.equal(3); // Pagado
    expect(await nati.ganancias(ID)).to.equal(E("1.1"));
    expect(await nati.gananciaEstimada(ID, a.address)).to.be.gt(0n);

    // cierre y retiros: cada quien recibe 2 * 7.1 / 6
    await time.increaseTo(cierre);
    const esperado = (E("2") * E("7.1")) / E("6");
    for (const s of [a, b, c]) {
      await expect(nati.connect(s).retirar(ID)).to.changeEtherBalance(s, esperado);
    }
    expect(await balance(nati)).to.be.lt(3n);
  });

  describe("votacion", () => {
    it("un solo rechazo cierra la solicitud", async () => {
      const { nati, a, b, empresa } = await loadFixture(fixture);
      const { idSol } = await solicitud(nati, empresa);
      await nati.connect(a).votar(idSol, true);
      await expect(nati.connect(b).votar(idSol, false)).to.emit(nati, "PrestamoRechazado");
      expect((await nati.obtenerSolicitud(idSol)).estado).to.equal(1); // Rechazada
      await expect(nati.connect(empresa).cobrarPrestamo(idSol)).to.be.revertedWith("No esta en votacion");
    });

    it("no vota quien no aporta, ni dos veces", async () => {
      const { nati, a, empresa, d } = await loadFixture(fixture);
      const { idSol } = await solicitud(nati, empresa);
      await nati.connect(d).unirse(ID); // miembro sin aportes
      await expect(nati.connect(d).votar(idSol, true)).to.be.revertedWith("No eres aportante activo");
      await expect(nati.connect(empresa).votar(idSol, true)).to.be.revertedWith("No eres aportante activo");
      await nati.connect(a).votar(idSol, true);
      await expect(nati.connect(a).votar(idSol, true)).to.be.revertedWith("Ya votaste");
    });

    it("cobrar sin unanimidad falla; solo el solicitante cobra", async () => {
      const { nati, a, b, empresa } = await loadFixture(fixture);
      const { idSol } = await solicitud(nati, empresa);
      await nati.connect(a).votar(idSol, true);
      await nati.connect(b).votar(idSol, true);
      await expect(nati.connect(empresa).cobrarPrestamo(idSol)).to.be.revertedWith("Falta unanimidad");
      await expect(nati.connect(a).cobrarPrestamo(idSol)).to.be.revertedWith("Solo el solicitante");
    });

    it("un aportante nuevo que llega durante la votacion tambien debe votar", async () => {
      const { nati, a, b, c, empresa, d } = await loadFixture(fixture);
      const { idSol } = await solicitud(nati, empresa);
      for (const s of [a, b, c]) await nati.connect(s).votar(idSol, true);
      await nati.connect(d).unirse(ID);
      await nati.connect(d).aportar(ID, { value: E("1") });
      expect(await nati.votantesRequeridos(ID)).to.equal(4n);
      await expect(nati.connect(empresa).cobrarPrestamo(idSol)).to.be.revertedWith("Falta unanimidad");
      await nati.connect(d).votar(idSol, true);
      await expect(nati.connect(empresa).cobrarPrestamo(idSol)).to.emit(nati, "PrestamoDesembolsado");
    });

    it("la vista marca Vencida si pasa la fecha limite sin cobrar", async () => {
      const { nati, empresa } = await loadFixture(fixture);
      const { idSol, limite } = await solicitud(nati, empresa);
      await time.increaseTo(limite);
      expect((await nati.obtenerSolicitud(idSol)).estado).to.equal(5); // Vencida
      await expect(nati.connect(empresa).cobrarPrestamo(idSol)).to.be.revertedWith("Solicitud vencida");
    });
  });

  describe("limites de la solicitud", () => {
    it("superar el tope del 50% falla", async () => {
      const { nati, empresa } = await loadFixture(fixture);
      const limite = BigInt((await time.latest()) + 5 * DIA);
      await expect(
        nati.connect(empresa).solicitarPrestamo(ID, E("3") + 1n, 1000n, limite, "X", "Y", HASH),
      ).to.be.revertedWith("Monto supera el tope");
    });

    it("el tope se revisa otra vez al cobrar", async () => {
      const { nati, a, b, c, empresa } = await loadFixture(fixture);
      const { idSol } = await solicitud(nati, empresa);
      for (const s of [a, b, c]) await nati.connect(s).votar(idSol, true);
      await nati.connect(c).salidaEmergencia(ID); // baja el saldo
      await expect(nati.connect(empresa).cobrarPrestamo(idSol)).to.be.revertedWith("Monto supera el tope");
    });

    it("un segundo prestamo activo falla", async () => {
      const { nati, a, b, c, empresa, d } = await loadFixture(fixture);
      const { idSol } = await solicitud(nati, empresa, E("1"));
      const otra = await solicitud(nati, d, E("1"));
      for (const s of [a, b, c]) {
        await nati.connect(s).votar(idSol, true);
        await nati.connect(s).votar(otra.idSol, true);
      }
      await nati.connect(empresa).cobrarPrestamo(idSol);
      await expect(solicitud(nati, d, E("1"))).to.be.revertedWith("Hay un prestamo activo");
      await expect(nati.connect(d).cobrarPrestamo(otra.idSol)).to.be.revertedWith("Hay un prestamo activo");
    });

    it("fechaLimite >= cierre falla; retorno fuera de rango falla", async () => {
      const { nati, empresa, cierre } = await loadFixture(fixture);
      await expect(
        nati.connect(empresa).solicitarPrestamo(ID, E("1"), 1000n, cierre, "X", "Y", HASH),
      ).to.be.revertedWith("Fecha limite invalida");
      const limite = BigInt((await time.latest()) + DIA);
      await expect(nati.connect(empresa).solicitarPrestamo(ID, E("1"), 99n, limite, "X", "Y", HASH)).to.be.revertedWith(
        "Retorno invalido",
      );
      await expect(
        nati.connect(empresa).solicitarPrestamo(ID, E("1"), 5001n, limite, "X", "Y", HASH),
      ).to.be.revertedWith("Retorno invalido");
    });

    it("hashGarantia en 0 falla", async () => {
      const { nati, empresa } = await loadFixture(fixture);
      await expect(solicitud(nati, empresa, E("1"), 5, ethers.ZeroHash)).to.be.revertedWith("Falta la garantia");
    });
  });

  describe("prestamo activo y mora", () => {
    it("unirse y salidaEmergencia se bloquean con un prestamo activo", async () => {
      const { nati, a, b, c, empresa, d } = await loadFixture(fixture);
      const { idSol } = await solicitud(nati, empresa);
      for (const s of [a, b, c]) await nati.connect(s).votar(idSol, true);
      await nati.connect(empresa).cobrarPrestamo(idSol);
      await expect(nati.connect(d).unirse(ID)).to.be.revertedWith("Hay un prestamo activo");
      await expect(nati.connect(a).salidaEmergencia(ID)).to.be.revertedWith("Hay un prestamo activo");
    });

    it("pago parcial + mora: la perdida se reparte en proporcion y retirar espera la mora", async () => {
      const { nati, a, b, c, empresa, cierre } = await loadFixture(fixture);
      await nati.connect(a).aportar(ID, { value: E("1") }); // A: 3, B: 2, C: 2 -> total 7
      const { idSol, limite } = await solicitud(nati, empresa);
      for (const s of [a, b, c]) await nati.connect(s).votar(idSol, true);
      await nati.connect(empresa).cobrarPrestamo(idSol);
      await nati.connect(empresa).pagarPrestamo(idSol, { value: E("1") });

      await expect(nati.declararMora(idSol)).to.be.revertedWith("Aun no vence");
      await time.increaseTo(limite + 1n);
      await time.increaseTo(cierre);
      await expect(nati.connect(a).retirar(ID)).to.be.revertedWith("Hay un prestamo pendiente");

      await expect(nati.connect(b).declararMora(idSol)).to.emit(nati, "PrestamoEnMora");
      const n = await nati.obtenerNatillera(ID);
      expect(n.perdidas).to.equal(E("2"));
      expect(n.prestamoActivo).to.equal(0n);
      expect((await nati.obtenerSolicitud(idSol)).estado).to.equal(4); // EnMora
      expect(await nati.gananciaEstimada(ID, a.address)).to.be.lt(0n);

      // quedan 5 de 7: cada quien recibe aportado * 5 / 7
      await expect(nati.connect(a).retirar(ID)).to.changeEtherBalance(a, (E("3") * E("5")) / E("7"));
      await expect(nati.connect(b).retirar(ID)).to.changeEtherBalance(b, (E("2") * E("5")) / E("7"));
      await expect(nati.connect(c).retirar(ID)).to.changeEtherBalance(c, (E("2") * E("5")) / E("7"));
      expect(await balance(nati)).to.be.lt(3n);
    });
  });

  describe("eventos", () => {
    it("soloMiembros rechaza externos, cupo lleno y precio incorrecto", async () => {
      const { nati, a, b, c, empresa } = await loadFixture(fixture);
      const fecha = BigInt((await time.latest()) + DIA);
      await nati.connect(a).crearEvento(ID, 1, "Rifa navidena", "Casa de A", fecha, E("0.1"), 1n, true);
      await expect(nati.connect(empresa).inscribirse(1n, { value: E("0.1") })).to.be.revertedWith("Solo miembros");
      await expect(nati.connect(b).inscribirse(1n, { value: E("0.2") })).to.be.revertedWith("Precio incorrecto");
      await nati.connect(b).inscribirse(1n, { value: E("0.1") });
      await expect(nati.connect(b).inscribirse(1n, { value: E("0.1") })).to.be.revertedWith("Cupo lleno");

      await nati.connect(a).crearEvento(ID, 2, "Paseo de olla", "Rio", fecha, 0n, 5n, false);
      await nati.connect(c).inscribirse(2n);
      await expect(nati.connect(c).inscribirse(2n)).to.be.revertedWith("Ya estas inscrito");
      expect((await nati.obtenerNatillera(ID)).fondoEventos).to.equal(E("0.1"));
    });

    it("solo el creador crea eventos y con datos validos", async () => {
      const { nati, a, b, cierre } = await loadFixture(fixture);
      const fecha = BigInt((await time.latest()) + DIA);
      await expect(nati.connect(b).crearEvento(ID, 3, "Venta", "Parque", fecha, 0n, 5n, false)).to.be.revertedWith(
        "Solo el creador",
      );
      await expect(nati.connect(a).crearEvento(ID, 3, "", "Parque", fecha, 0n, 5n, false)).to.be.revertedWith(
        "Titulo o lugar vacio",
      );
      await expect(nati.connect(a).crearEvento(ID, 3, "Venta", "Parque", cierre, 0n, 5n, false)).to.be.revertedWith(
        "Fecha invalida",
      );
      await expect(nati.connect(a).crearEvento(ID, 3, "Venta", "Parque", fecha, 0n, 0n, false)).to.be.revertedWith(
        "Cupo invalido",
      );
      await expect(nati.connect(a).crearEvento(ID, 5, "Venta", "Parque", fecha, 0n, 5n, false)).to.be.revertedWith(
        "Tipo invalido",
      );
    });
  });

  describe("retiro y salida", () => {
    it("nadie retira antes del cierre, ni el creador", async () => {
      const { nati, a, b, empresa } = await loadFixture(fixture);
      await expect(nati.connect(a).retirar(ID)).to.be.revertedWith("Aun no es fecha de cierre");
      await expect(nati.connect(b).retirar(ID)).to.be.revertedWith("Aun no es fecha de cierre");
      await expect(nati.connect(empresa).retirar(ID)).to.be.revertedWith("Aun no es fecha de cierre");
    });

    it("salida de emergencia: 90% y la penalidad queda para el grupo; balance final en 0", async () => {
      const { nati, a, b, c, cierre } = await loadFixture(fixture);
      await expect(nati.connect(b).salidaEmergencia(ID)).to.changeEtherBalance(b, E("1.8"));
      const n = await nati.obtenerNatillera(ID);
      expect(n.fondoPenalidades).to.equal(E("0.2"));
      expect(n.aportantesActivos).to.equal(2n);
      expect(n.totalAportesActivos).to.equal(E("4"));

      await time.increaseTo(cierre);
      await expect(nati.connect(a).retirar(ID)).to.changeEtherBalance(a, E("2.1"));
      await expect(nati.connect(c).retirar(ID)).to.changeEtherBalance(c, E("2.1"));
      await expect(nati.connect(b).retirar(ID)).to.be.revertedWith("Nada que retirar");
      expect(await balance(nati)).to.equal(0n);
    });

    it("el ultimo aportante activo se lleva todo el saldo", async () => {
      const { nati, a, b, c, empresa } = await loadFixture(fixture);
      await nati.connect(a).salidaEmergencia(ID);
      await nati.connect(b).salidaEmergencia(ID);
      const saldo = (await nati.obtenerNatillera(ID)).saldo;
      await expect(nati.connect(c).salidaEmergencia(ID)).to.changeEtherBalance(c, saldo);
      expect(await balance(nati)).to.equal(0n);
      await expect(nati.connect(empresa).donar(ID, { value: 1n })).to.be.revertedWith("Sin aportantes activos");
    });

    it("maximo 50 miembros", async () => {
      const { nati, a } = await loadFixture(fixture);
      await nati.connect(a).crearNatillera("Grande", E("1"), 1n, DIA);
      const id = await nati.totalNatilleras();
      for (let i = 1; i < 50; i++) {
        const w = ethers.Wallet.createRandom().connect(ethers.provider);
        await a.sendTransaction({ to: w.address, value: E("0.01") });
        await nati.connect(w).unirse(id);
      }
      const extra = ethers.Wallet.createRandom().connect(ethers.provider);
      await a.sendTransaction({ to: extra.address, value: E("0.01") });
      await expect(nati.connect(extra).unirse(id)).to.be.revertedWith("Natillera llena");
    });
  });

  it("INVARIANTE: todo resuelto (evento, donacion, salida, mora parcial) y todos retiran -> balance ~0", async () => {
    const { nati, a, b, c, empresa, d, cierre } = await loadFixture(fixture);
    await nati.connect(d).unirse(ID);
    await nati.connect(d).aportar(ID, { value: E("1") });

    const fecha = BigInt((await time.latest()) + DIA);
    await nati.connect(a).crearEvento(ID, 3, "Venta de empanadas", "Esquina", fecha, E("0.37"), 5n, false);
    await nati.connect(empresa).inscribirse(1n, { value: E("0.37") });
    await nati.connect(empresa).donar(ID, { value: 123457n });

    // un prestamo que se paga y otro que cae en mora
    const p1 = await solicitud(nati, empresa, E("1"), 3);
    for (const s of [a, b, c, d]) await nati.connect(s).votar(p1.idSol, true);
    await nati.connect(empresa).cobrarPrestamo(p1.idSol);
    await nati.connect(empresa).pagarPrestamo(p1.idSol, { value: E("1.1") });

    await nati.connect(d).salidaEmergencia(ID);

    const p2 = await solicitud(nati, empresa, E("2"), 5);
    for (const s of [a, b, c]) await nati.connect(s).votar(p2.idSol, true);
    await nati.connect(empresa).cobrarPrestamo(p2.idSol);
    await nati.connect(empresa).pagarPrestamo(p2.idSol, { value: E("0.777") });
    await time.increaseTo(p2.limite + 1n);
    await nati.declararMora(p2.idSol);

    await time.increaseTo(cierre);
    for (const s of [a, b, c]) await nati.connect(s).retirar(ID);
    const miembros = (await nati.obtenerMiembros(ID)).length;
    expect(await balance(nati)).to.be.lt(BigInt(miembros));
  });
});
