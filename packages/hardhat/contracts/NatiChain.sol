// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title NatiChain v2 - La natillera donde nadie se vuela con la plata
/// @notice Ahorro grupal sin administrador: nadie puede mover la plata del grupo solo.
///         Las ganancias (penalidades, eventos, donaciones e intereses de prestamos aprobados
///         por unanimidad) entran antes del cierre y al cierre se reparten en proporcion a lo aportado.
contract NatiChain {
    // ---------------------------------------------------------------- Tipos

    struct Natillera {
        string nombre;
        address creador;
        uint256 cuota;               // en wei por aporte
        uint256 numCuotas;           // maximo de cuotas por miembro
        uint256 cierre;              // timestamp de "diciembre"
        uint256 saldo;               // MON disponible de esta natillera dentro del contrato
        uint256 totalAportesActivos; // aportes de quienes siguen (base del reparto)
        uint256 aportantesActivos;   // miembros con aporte > 0 que no han salido
        uint256 fondoPenalidades;
        uint256 fondoEventos;
        uint256 fondoDonaciones;
        uint256 fondoIntereses;
        uint256 perdidas;            // capital prestado que no volvio
        uint256 prestadoPendiente;   // capital por fuera en un prestamo desembolsado
        uint256 prestamoActivo;      // id de la solicitud desembolsada, o 0
        bool existe;
    }

    struct Evento {
        uint256 idNat;
        uint8 tipo; // 0 bingo, 1 rifa, 2 paseo, 3 venta, 4 otro
        string titulo;
        string lugar;
        uint256 fecha;
        uint256 precio;
        uint256 cupo;
        uint256 inscritos;
        bool soloMiembros;
    }

    enum Estado {
        EnVotacion,
        Rechazada,
        Desembolsado,
        Pagado,
        EnMora,
        Vencida // solo en la vista: paso la fecha limite sin cobrar
    }

    struct Solicitud {
        uint256 idNat;
        address prestatario;  // wallet que solicita, firma y recibe
        uint256 monto;
        uint256 retornoBps;   // retorno pactado sobre el monto (100 = 1%)
        uint256 fechaLimite;
        string solicitante;   // nombre o razon social
        string proposito;
        bytes32 hashGarantia; // hash del pagare
        Estado estado;
        uint256 pagado;       // abonos recibidos (entran al saldo al completar o en mora)
    }

    // ---------------------------------------------------------------- Estado

    uint256 public constant PENALIDAD_PCT = 10;
    uint256 public constant MAX_MIEMBROS = 50;
    uint256 public constant TOPE_PRESTAMO_PCT = 50;

    uint256 public totalNatilleras;
    uint256 public totalEventos;
    uint256 public totalSolicitudes;

    mapping(uint256 => Natillera) internal natilleras;
    mapping(uint256 => address[]) private miembros;
    mapping(uint256 => mapping(address => bool)) public esMiembro;
    mapping(uint256 => mapping(address => uint256)) public aportado;
    mapping(uint256 => mapping(address => bool)) public yaSalio;

    mapping(uint256 => Evento) internal eventos;
    mapping(uint256 => uint256[]) private eventosPorNat;
    mapping(uint256 => address[]) private inscritosPorEvento;
    mapping(uint256 => mapping(address => bool)) public inscrito;

    mapping(uint256 => Solicitud) internal solicitudes;
    mapping(uint256 => uint256[]) private solicitudesPorNat;
    /// @notice 0 = no ha votado, 1 = si, 2 = no
    mapping(uint256 => mapping(address => uint8)) public votoDe;

    uint256 private _bloqueo = 1;

    // ---------------------------------------------------------------- Eventos

    event NatilleraCreada(uint256 indexed id, string nombre, address indexed creador, uint256 cuota, uint256 cierre);
    event MiembroUnido(uint256 indexed id, address indexed miembro);
    event Aporte(uint256 indexed id, address indexed miembro, uint256 monto);
    event SalidaEmergencia(uint256 indexed id, address indexed miembro, uint256 devuelto, uint256 penalidad);
    event Retiro(uint256 indexed id, address indexed miembro, uint256 aportado, uint256 pagado);

    event EventoCreado(uint256 indexed idEvento, uint256 indexed idNat, uint8 tipo, string titulo, uint256 fecha, uint256 precio);
    event InscripcionEvento(uint256 indexed idEvento, uint256 indexed idNat, address indexed quien, uint256 precio);
    event Donacion(uint256 indexed id, address indexed donante, uint256 monto);

    event PrestamoSolicitado(uint256 indexed idSol, uint256 indexed idNat, address indexed prestatario, uint256 monto, uint256 retornoBps, uint256 fechaLimite);
    event VotoEmitido(uint256 indexed idSol, address indexed votante, bool aprueba);
    event PrestamoRechazado(uint256 indexed idSol, address indexed por);
    event PrestamoDesembolsado(uint256 indexed idSol, uint256 indexed idNat, uint256 monto);
    event PagoPrestamo(uint256 indexed idSol, address indexed pagador, uint256 monto, uint256 faltante);
    event PrestamoPagado(uint256 indexed idSol, uint256 indexed idNat, uint256 retorno);
    event PrestamoEnMora(uint256 indexed idSol, uint256 indexed idNat, uint256 pagado, uint256 perdida);

    // ---------------------------------------------------------------- Modificadores

    modifier existe(uint256 id) {
        require(natilleras[id].existe, "Natillera no existe");
        _;
    }

    modifier nonReentrant() {
        require(_bloqueo == 1, "Reentrada");
        _bloqueo = 2;
        _;
        _bloqueo = 1;
    }

    // ---------------------------------------------------------------- Natillera

    function crearNatillera(
        string calldata nombre,
        uint256 cuota,
        uint256 numCuotas,
        uint256 duracionSegundos
    ) external returns (uint256 id) {
        require(bytes(nombre).length > 0, "Nombre vacio");
        require(cuota > 0 && numCuotas > 0 && duracionSegundos > 0, "Datos invalidos");

        id = ++totalNatilleras;
        Natillera storage n = natilleras[id];
        n.nombre = nombre;
        n.creador = msg.sender;
        n.cuota = cuota;
        n.numCuotas = numCuotas;
        n.cierre = block.timestamp + duracionSegundos;
        n.existe = true;

        emit NatilleraCreada(id, nombre, msg.sender, cuota, n.cierre);
        _unir(id, msg.sender);
    }

    function unirse(uint256 id) external existe(id) {
        Natillera storage n = natilleras[id];
        require(block.timestamp < n.cierre, "La natillera ya cerro");
        require(n.prestamoActivo == 0, "Hay un prestamo activo");
        require(!esMiembro[id][msg.sender], "Ya eres miembro");
        _unir(id, msg.sender);
    }

    function aportar(uint256 id) external payable existe(id) {
        Natillera storage n = natilleras[id];
        require(esMiembro[id][msg.sender] && !yaSalio[id][msg.sender], "No eres miembro activo");
        require(block.timestamp < n.cierre, "La natillera ya cerro");
        require(msg.value == n.cuota, "El monto debe ser igual a la cuota");
        uint256 previo = aportado[id][msg.sender];
        require(previo + msg.value <= n.cuota * n.numCuotas, "Ya pagaste todas las cuotas");

        if (previo == 0) n.aportantesActivos += 1;
        aportado[id][msg.sender] = previo + msg.value;
        n.saldo += msg.value;
        n.totalAportesActivos += msg.value;
        emit Aporte(id, msg.sender, msg.value);
    }

    /// @notice Calamidad: sales antes del cierre con el 90% de min(aportado, valor).
    ///         Lo que no se devuelve queda en fondoPenalidades para el grupo.
    function salidaEmergencia(uint256 id) external existe(id) nonReentrant {
        Natillera storage n = natilleras[id];
        require(block.timestamp < n.cierre, "Ya cerro: usa retirar");
        require(n.prestamoActivo == 0, "Hay un prestamo activo");
        uint256 base = aportado[id][msg.sender];
        require(esMiembro[id][msg.sender] && !yaSalio[id][msg.sender] && base > 0, "Nada que retirar");

        uint256 devolver;
        uint256 penalidad;
        if (n.aportantesActivos == 1) {
            // ultimo aportante: se lleva todo lo que queda, salvo que haya plata de terceros
            require(n.fondoEventos + n.fondoDonaciones == 0, "Hay fondos de terceros: espera al cierre");
            devolver = n.saldo;
            penalidad = 0;
        } else {
            uint256 v = _valor(id, msg.sender);
            uint256 referencia = v < base ? v : base;
            devolver = (referencia * (100 - PENALIDAD_PCT)) / 100;
            penalidad = base - devolver;
            n.fondoPenalidades += penalidad;
        }

        yaSalio[id][msg.sender] = true;
        aportado[id][msg.sender] = 0;
        n.aportantesActivos -= 1;
        n.totalAportesActivos -= base;
        n.saldo -= devolver;
        if (n.aportantesActivos == 0) {
            // se pago todo el saldo: se limpian las ganancias/perdidas para no inflar a quien aporte despues
            n.fondoPenalidades = 0;
            n.fondoEventos = 0;
            n.fondoDonaciones = 0;
            n.fondoIntereses = 0;
            n.perdidas = 0;
        }

        _enviar(msg.sender, devolver);
        emit SalidaEmergencia(id, msg.sender, devolver, penalidad);
    }

    /// @notice "Diciembre": despues del cierre cada quien retira lo suyo mas su parte de las ganancias
    ///         (o menos su parte de las perdidas).
    function retirar(uint256 id) external existe(id) nonReentrant {
        Natillera storage n = natilleras[id];
        require(block.timestamp >= n.cierre, "Aun no es fecha de cierre");
        require(n.prestamoActivo == 0, "Hay un prestamo pendiente");
        uint256 base = aportado[id][msg.sender];
        require(esMiembro[id][msg.sender] && !yaSalio[id][msg.sender] && base > 0, "Nada que retirar");

        uint256 pago = _valor(id, msg.sender);
        if (pago > n.saldo) pago = n.saldo;

        // totalAportesActivos NO cambia despues del cierre: el reparto queda fijo
        yaSalio[id][msg.sender] = true;
        aportado[id][msg.sender] = 0;
        n.aportantesActivos -= 1;
        n.saldo -= pago;

        _enviar(msg.sender, pago);
        emit Retiro(id, msg.sender, base, pago);
    }

    // ---------------------------------------------------------------- Eventos y donaciones

    function crearEvento(
        uint256 idNat,
        uint8 tipo,
        string memory titulo,
        string memory lugar,
        uint256 fecha,
        uint256 precio,
        uint256 cupo,
        bool soloMiembros
    ) external existe(idNat) returns (uint256 idEvento) {
        require(msg.sender == natilleras[idNat].creador, "Solo el creador");
        require(tipo <= 4, "Tipo invalido");
        require(bytes(titulo).length > 0 && bytes(lugar).length > 0, "Titulo o lugar vacio");
        require(block.timestamp < fecha && fecha < natilleras[idNat].cierre, "Fecha invalida");
        require(cupo > 0, "Cupo invalido");

        idEvento = ++totalEventos;
        Evento storage e = eventos[idEvento];
        e.idNat = idNat;
        e.tipo = tipo;
        e.titulo = titulo;
        e.lugar = lugar;
        e.fecha = fecha;
        e.precio = precio;
        e.cupo = cupo;
        e.soloMiembros = soloMiembros;
        eventosPorNat[idNat].push(idEvento);

        emit EventoCreado(idEvento, idNat, tipo, titulo, fecha, precio);
    }

    function inscribirse(uint256 idEvento) external payable {
        Evento storage e = eventos[idEvento];
        require(e.idNat != 0, "Evento no existe");
        Natillera storage n = natilleras[e.idNat];
        require(block.timestamp < e.fecha, "El evento ya paso");
        require(e.inscritos < e.cupo, "Cupo lleno");
        require(!inscrito[idEvento][msg.sender], "Ya estas inscrito");
        require(msg.value == e.precio, "Precio incorrecto");
        require(n.aportantesActivos > 0, "Sin aportantes activos");
        if (e.soloMiembros) require(_esAportanteActivo(e.idNat, msg.sender), "Solo miembros");

        inscrito[idEvento][msg.sender] = true;
        inscritosPorEvento[idEvento].push(msg.sender);
        e.inscritos += 1;
        n.saldo += msg.value;
        n.fondoEventos += msg.value;

        emit InscripcionEvento(idEvento, e.idNat, msg.sender, msg.value);
    }

    function donar(uint256 id) external payable existe(id) {
        Natillera storage n = natilleras[id];
        require(msg.value > 0, "Monto invalido");
        require(block.timestamp < n.cierre, "La natillera ya cerro");
        require(n.aportantesActivos > 0, "Sin aportantes activos");

        n.saldo += msg.value;
        n.fondoDonaciones += msg.value;
        emit Donacion(id, msg.sender, msg.value);
    }

    // ---------------------------------------------------------------- Prestamos aprobados por el grupo

    function solicitarPrestamo(
        uint256 idNat,
        uint256 monto,
        uint256 retornoBps,
        uint256 fechaLimite,
        string memory solicitante,
        string memory proposito,
        bytes32 hashGarantia
    ) external existe(idNat) returns (uint256 idSol) {
        Natillera storage n = natilleras[idNat];
        require(monto > 0 && monto * 100 <= n.saldo * TOPE_PRESTAMO_PCT, "Monto supera el tope");
        require(retornoBps >= 100 && retornoBps <= 5000, "Retorno invalido");
        require(block.timestamp < fechaLimite && fechaLimite < n.cierre, "Fecha limite invalida");
        require(hashGarantia != bytes32(0), "Falta la garantia");
        require(n.prestamoActivo == 0, "Hay un prestamo activo");

        idSol = ++totalSolicitudes;
        Solicitud storage s = solicitudes[idSol];
        s.idNat = idNat;
        s.prestatario = msg.sender;
        s.monto = monto;
        s.retornoBps = retornoBps;
        s.fechaLimite = fechaLimite;
        s.solicitante = solicitante;
        s.proposito = proposito;
        s.hashGarantia = hashGarantia;
        s.estado = Estado.EnVotacion;
        solicitudesPorNat[idNat].push(idSol);

        emit PrestamoSolicitado(idSol, idNat, msg.sender, monto, retornoBps, fechaLimite);
    }

    function votar(uint256 idSol, bool aprueba) external {
        Solicitud storage s = solicitudes[idSol];
        require(s.idNat != 0, "Solicitud no existe");
        require(s.estado == Estado.EnVotacion, "No esta en votacion");
        require(block.timestamp < s.fechaLimite, "Solicitud vencida");
        require(_esAportanteActivo(s.idNat, msg.sender), "No eres aportante activo");
        require(votoDe[idSol][msg.sender] == 0, "Ya votaste");

        votoDe[idSol][msg.sender] = aprueba ? 1 : 2;
        emit VotoEmitido(idSol, msg.sender, aprueba);
        if (!aprueba) {
            s.estado = Estado.Rechazada;
            emit PrestamoRechazado(idSol, msg.sender);
        }
    }

    function cobrarPrestamo(uint256 idSol) external nonReentrant {
        Solicitud storage s = solicitudes[idSol];
        require(s.idNat != 0, "Solicitud no existe");
        require(msg.sender == s.prestatario, "Solo el solicitante");
        require(s.estado == Estado.EnVotacion, "No esta en votacion");
        require(block.timestamp < s.fechaLimite, "Solicitud vencida");

        Natillera storage n = natilleras[s.idNat];
        require(n.prestamoActivo == 0, "Hay un prestamo activo");
        require(s.monto * 100 <= n.saldo * TOPE_PRESTAMO_PCT, "Monto supera el tope");
        require(n.aportantesActivos > 0 && _votosSi(idSol) == n.aportantesActivos, "Falta unanimidad");

        n.saldo -= s.monto;
        n.prestadoPendiente += s.monto;
        n.prestamoActivo = idSol;
        s.estado = Estado.Desembolsado;

        _enviar(s.prestatario, s.monto);
        emit PrestamoDesembolsado(idSol, s.idNat, s.monto);
    }

    function pagarPrestamo(uint256 idSol) external payable {
        Solicitud storage s = solicitudes[idSol];
        require(s.estado == Estado.Desembolsado && s.idNat != 0, "No esta desembolsado");
        require(msg.value > 0, "Monto invalido");
        uint256 total = _deuda(s);
        require(s.pagado + msg.value <= total, "Pagas mas de lo que falta");

        s.pagado += msg.value;
        emit PagoPrestamo(idSol, msg.sender, msg.value, total - s.pagado);

        if (s.pagado == total) {
            Natillera storage n = natilleras[s.idNat];
            uint256 retorno = total - s.monto;
            n.saldo += total;
            n.fondoIntereses += retorno;
            n.prestadoPendiente -= s.monto;
            n.prestamoActivo = 0;
            s.estado = Estado.Pagado;
            emit PrestamoPagado(idSol, s.idNat, retorno);
        }
    }

    function declararMora(uint256 idSol) external {
        Solicitud storage s = solicitudes[idSol];
        require(s.estado == Estado.Desembolsado && s.idNat != 0, "No esta desembolsado");
        require(block.timestamp > s.fechaLimite, "Aun no vence");

        Natillera storage n = natilleras[s.idNat];
        uint256 perdida;
        n.saldo += s.pagado;
        if (s.pagado < s.monto) {
            perdida = s.monto - s.pagado;
            n.perdidas += perdida;
        } else {
            n.fondoIntereses += s.pagado - s.monto;
        }
        n.prestadoPendiente -= s.monto;
        n.prestamoActivo = 0;
        s.estado = Estado.EnMora;

        emit PrestamoEnMora(idSol, s.idNat, s.pagado, perdida);
    }

    // ---------------------------------------------------------------- Lecturas

    function obtenerNatillera(uint256 id) external view returns (Natillera memory) {
        return natilleras[id];
    }

    function obtenerMiembros(uint256 id) external view existe(id) returns (address[] memory) {
        return miembros[id];
    }

    function tiempoRestante(uint256 id) external view existe(id) returns (uint256) {
        uint256 c = natilleras[id].cierre;
        return block.timestamp >= c ? 0 : c - block.timestamp;
    }

    function ganancias(uint256 id) public view returns (uint256) {
        Natillera storage n = natilleras[id];
        return n.fondoPenalidades + n.fondoEventos + n.fondoDonaciones + n.fondoIntereses;
    }

    /// @notice Lo que le corresponde hoy a `quien` si la natillera se repartiera.
    function valor(uint256 id, address quien) external view returns (uint256) {
        return _valor(id, quien);
    }

    function gananciaEstimada(uint256 id, address quien) external view returns (int256) {
        return int256(_valor(id, quien)) - int256(aportado[id][quien]);
    }

    function obtenerEvento(uint256 idEvento) external view returns (Evento memory) {
        return eventos[idEvento];
    }

    function eventosDe(uint256 idNat) external view returns (uint256[] memory) {
        return eventosPorNat[idNat];
    }

    function inscritosDe(uint256 idEvento) external view returns (address[] memory) {
        return inscritosPorEvento[idEvento];
    }

    function obtenerSolicitud(uint256 idSol) external view returns (Solicitud memory s) {
        s = solicitudes[idSol];
        if (s.estado == Estado.EnVotacion && s.idNat != 0 && block.timestamp >= s.fechaLimite) {
            s.estado = Estado.Vencida;
        }
    }

    function solicitudesDe(uint256 idNat) external view returns (uint256[] memory) {
        return solicitudesPorNat[idNat];
    }

    /// @notice Votos a favor de aportantes activos actuales (los que cuentan para desembolsar).
    function votosAFavor(uint256 idSol) external view returns (uint256) {
        return _votosSi(idSol);
    }

    function votantesRequeridos(uint256 idNat) external view returns (uint256) {
        return natilleras[idNat].aportantesActivos;
    }

    // ---------------------------------------------------------------- Internas

    function _unir(uint256 id, address quien) private {
        require(miembros[id].length < MAX_MIEMBROS, "Natillera llena");
        esMiembro[id][quien] = true;
        miembros[id].push(quien);
        emit MiembroUnido(id, quien);
    }

    function _esAportanteActivo(uint256 id, address quien) private view returns (bool) {
        return esMiembro[id][quien] && !yaSalio[id][quien] && aportado[id][quien] > 0;
    }

    function _valor(uint256 id, address quien) private view returns (uint256) {
        Natillera storage n = natilleras[id];
        uint256 total = n.totalAportesActivos;
        if (total == 0) return 0;
        uint256 bruto = total + ganancias(id);
        if (bruto <= n.perdidas) return 0;
        return (aportado[id][quien] * (bruto - n.perdidas)) / total;
    }

    function _votosSi(uint256 idSol) private view returns (uint256 c) {
        uint256 idNat = solicitudes[idSol].idNat;
        address[] storage lista = miembros[idNat];
        for (uint256 i = 0; i < lista.length; i++) {
            address m = lista[i];
            if (_esAportanteActivo(idNat, m) && votoDe[idSol][m] == 1) c++;
        }
    }

    function _deuda(Solicitud storage s) private view returns (uint256) {
        return s.monto + (s.monto * s.retornoBps) / 10000;
    }

    function _enviar(address a, uint256 monto) private {
        if (monto == 0) return;
        (bool ok, ) = payable(a).call{value: monto}("");
        require(ok, "Fallo el envio");
    }
}
