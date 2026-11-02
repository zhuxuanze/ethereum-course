pragma solidity 0.5.1;
import "./SafeMath.sol";

contract FixedVoting {
    using SafeMath for uint256;
    mapping(address => uint256) public remainingVotes;
    uint256[] public candidates;
    address payable public owner;
    bool public hasEnded = false;
    modifier notEnded() { require(!hasEnded, "Voting ended"); _; }

    constructor(uint256 amountOfCandidates) public {
        require(amountOfCandidates > 0, "No candidates");
        candidates.length = amountOfCandidates;
        owner = msg.sender;
    }
    function buyVotes() public payable notEnded {
        require(msg.value >= 1 ether, "At least one ether");
        remainingVotes[msg.sender] = remainingVotes[msg.sender].add(msg.value / 1 ether);
        uint256 refund = msg.value % 1 ether;
        if (refund > 0) msg.sender.transfer(refund);
    }
    function vote(uint256 candidateID, uint256 amountOfVotes) public notEnded {
        require(candidateID < candidates.length, "Invalid candidate");
        remainingVotes[msg.sender] = remainingVotes[msg.sender].sub(amountOfVotes);
        candidates[candidateID] = candidates[candidateID].add(amountOfVotes);
    }
    function payoutVotes(uint256 amount) public notEnded {
        remainingVotes[msg.sender] = remainingVotes[msg.sender].sub(amount);
        msg.sender.transfer(amount.mul(1 ether));
    }
    function endVoting() public notEnded {
        require(msg.sender == owner, "Owner only");
        hasEnded = true;
        owner.transfer(address(this).balance);
    }
    function displayBalanceInEther() public view returns (uint256) {
        return address(this).balance / 1 ether;
    }
}
