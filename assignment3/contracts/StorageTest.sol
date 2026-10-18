pragma solidity ^0.5.1;

contract StorageTest {
    bytes32[] b;

    function put(bytes32[] memory _b) public {
        b = _b;
    }
}
