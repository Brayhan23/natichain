// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev SOLO PARA PRUEBAS: socio malicioso que intenta reentrar a NatiChain al recibir MON.
contract Atacante {
    address public immutable nati;
    uint256 public id;
    uint8 public modo; // 1 = reentra salidaEmergencia, 2 = reentra retirar, 3 = reentra aportar
    uint256 public recibido;
    uint256 public intentos;
    bool public reentroOk;

    constructor(address n) {
        nati = n;
    }

    function preparar(uint256 id_, uint8 modo_) external payable {
        id = id_;
        modo = modo_;
        (bool ok, ) = nati.call(abi.encodeWithSignature("unirse(uint256)", id_));
        require(ok, "unirse fallo");
    }

    function aportar() external payable {
        (bool ok, ) = nati.call{value: msg.value}(abi.encodeWithSignature("aportar(uint256)", id));
        require(ok, "aportar fallo");
    }

    function salir() external {
        (bool ok, ) = nati.call(abi.encodeWithSignature("salidaEmergencia(uint256)", id));
        require(ok, "salir fallo");
    }

    function retirar() external {
        (bool ok, ) = nati.call(abi.encodeWithSignature("retirar(uint256)", id));
        require(ok, "retirar fallo");
    }

    receive() external payable {
        recibido += msg.value;
        if (intentos++ > 0) return;
        bool ok;
        if (modo == 1) (ok, ) = nati.call(abi.encodeWithSignature("salidaEmergencia(uint256)", id));
        else if (modo == 2) (ok, ) = nati.call(abi.encodeWithSignature("retirar(uint256)", id));
        else if (modo == 3 && address(this).balance >= 1 ether)
            (ok, ) = nati.call{value: 1 ether}(abi.encodeWithSignature("aportar(uint256)", id));
        if (ok) reentroOk = true;
    }
}
