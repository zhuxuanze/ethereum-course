pragma solidity 0.5.1;
contract Migrations {
    address public owner;
    uint256 public last_completed_migration;
    constructor() public { owner = msg.sender; }
    function setCompleted(uint256 completed) public {
        require(msg.sender == owner, "Owner only");
        last_completed_migration = completed;
    }
}
