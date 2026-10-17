// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title NatiChain - La natillera donde nadie se vuela con la plata
/// @notice Ahorro grupal: nadie (ni el creador) puede retirar antes del cierre.
///         No existe ninguna funcion de administrador para mover fondos.
contract NatiChain {
    struct Natillera {
        string nombre;
        address creador;
        uint256 cuota;               // en wei por aporte
        uint256 numCuotas;           // maximo de cuotas por miembro
        uint256 cierre;              // timestamp de "diciembre"
        uint256 saldo;               // plata actual en esta natillera
        uint256 totalAportesActivos; // aportes de quienes siguen (para repartir bono)
        uint256 fondoPenalidades;    // penalidades por salida anticipada
        bool existe;
    }

    uint256 public constant PENALIDAD_PCT = 10;
    uint256 public totalNatilleras;

    mapping(uint256 => Natillera) public natilleras;
    mapping(uint256 => address[]) private miembros;
    mapping(uint256 => mapping(address => bool)) public esMiembro;
    mapping(uint256 => mapping(address => uint256)) public aportado;
    mapping(uint256 => mapping(address => bool)) public yaSalio;

    event NatilleraCreada(uint256 indexed id, string nombre, address indexed creador, uint256 cuota, uint256 cierre);
    event MiembroUnido(uint256 indexed id, address indexed miembro);
    event Aporte(uint256 indexed id, address indexed miembro, uint256 monto);
    event SalidaEmergencia(uint256 indexed id, address indexed miembro, uint256 devuelto, uint256 penalidad);
    event Retiro(uint256 indexed id, address indexed miembro, uint256 monto, uint256 bono);

    modifier existe(uint256 id) {
        require(natilleras[id].existe, "Natillera no existe");
        _;
    }

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
        require(block.timestamp < natilleras[id].cierre, "La natillera ya cerro");
        require(!esMiembro[id][msg.sender], "Ya eres miembro");
        _unir(id, msg.sender);
    }

    function aportar(uint256 id) external payable existe(id) {
        Natillera storage n = natilleras[id];
        require(esMiembro[id][msg.sender] && !yaSalio[id][msg.sender], "No eres miembro activo");
        require(block.timestamp < n.cierre, "La natillera ya cerro");
        require(msg.value == n.cuota, "El monto debe ser igual a la cuota");
        require(aportado[id][msg.sender] + msg.value <= n.cuota * n.numCuotas, "Ya pagaste todas las cuotas");

        aportado[id][msg.sender] += msg.value;
        n.saldo += msg.value;
        n.totalAportesActivos += msg.value;
        emit Aporte(id, msg.sender, msg.value);
    }

    /// @notice Calamidad: sales antes del cierre y pierdes el 10%, que queda para el grupo.
    function salidaEmergencia(uint256 id) external existe(id) {
        Natillera storage n = natilleras[id];
        require(block.timestamp < n.cierre, "Ya cerro: usa retirar");
        uint256 base = aportado[id][msg.sender];
        require(esMiembro[id][msg.sender] && !yaSalio[id][msg.sender] && base > 0, "Nada que retirar");

        uint256 penalidad = (base * PENALIDAD_PCT) / 100;
        uint256 devolver = base - penalidad;

        // Efectos antes de enviar dinero (proteccion contra reentrada)
        yaSalio[id][msg.sender] = true;
        aportado[id][msg.sender] = 0;
        n.totalAportesActivos -= base;
        n.fondoPenalidades += penalidad;
        n.saldo -= devolver;

        (bool ok, ) = payable(msg.sender).call{value: devolver}("");
        require(ok, "Fallo el envio");
        emit SalidaEmergencia(id, msg.sender, devolver, penalidad);
    }

    /// @notice "Diciembre": despues del cierre cada quien retira lo suyo + su parte de penalidades.
    function retirar(uint256 id) external existe(id) {
        Natillera storage n = natilleras[id];
        require(block.timestamp >= n.cierre, "Aun no es fecha de cierre");
        uint256 base = aportado[id][msg.sender];
        require(esMiembro[id][msg.sender] && !yaSalio[id][msg.sender] && base > 0, "Nada que retirar");

        uint256 bono = (base * n.fondoPenalidades) / n.totalAportesActivos;
        uint256 total = base + bono;

        yaSalio[id][msg.sender] = true;
        aportado[id][msg.sender] = 0;
        n.saldo -= total;

        (bool ok, ) = payable(msg.sender).call{value: total}("");
        require(ok, "Fallo el envio");
        emit Retiro(id, msg.sender, base, bono);
    }

    // ---------- Lecturas para el frontend ----------

    function obtenerMiembros(uint256 id) external view existe(id) returns (address[] memory) {
        return miembros[id];
    }

    function tiempoRestante(uint256 id) external view existe(id) returns (uint256) {
        uint256 c = natilleras[id].cierre;
        return block.timestamp >= c ? 0 : c - block.timestamp;
    }

    function _unir(uint256 id, address quien) private {
        esMiembro[id][quien] = true;
        miembros[id].push(quien);
        emit MiembroUnido(id, quien);
    }
}
