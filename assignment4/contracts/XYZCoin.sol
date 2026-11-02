pragma solidity 0.5.1;
import "./ERC20.sol";
import "./SafeMath.sol";

contract XYZCoin is ERC20 {
    using SafeMath for uint256;
    string public name = "XYZCoin";
    string public symbol = "XYZ";
    uint8 public decimals = 0;
    uint256 private supply = 1000;
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowed;

    constructor() public {
        balances[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }
    function totalSupply() public view returns (uint256) { return supply; }
    function balanceOf(address tokenOwner) public view returns (uint256) {
        return balances[tokenOwner];
    }
    function allowance(address tokenOwner, address spender) public view returns (uint256) {
        return allowed[tokenOwner][spender];
    }
    function transfer(address to, uint256 value) public returns (bool) {
        move(msg.sender, to, value);
        return true;
    }
    function approve(address spender, uint256 value) public returns (bool) {
        require(spender != address(0), "XYZCoin: zero spender");
        allowed[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }
    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        allowed[from][msg.sender] = allowed[from][msg.sender].sub(value);
        move(from, to, value);
        return true;
    }
    function move(address from, address to, uint256 value) internal {
        require(to != address(0), "XYZCoin: zero recipient");
        balances[from] = balances[from].sub(value);
        balances[to] = balances[to].add(value);
        emit Transfer(from, to, value);
    }
}
