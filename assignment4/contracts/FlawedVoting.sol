pragma solidity 0.5.1;

// Intentionally vulnerable lab fixture. Deploy ONLY to a local test chain.
// The assignment's original behavior is retained to demonstrate the defect.
contract FlawedVoting {
    mapping(address => uint256) public remainingVotes;
    uint256[] public candidates;
    address owner;
    bool hasEnded = false;
    modifier notEnded() { require(!hasEnded); _; }
    constructor(uint256 amountOfCandidates) public {
        candidates.length = amountOfCandidates;
        owner = msg.sender;
    }
    function buyVotes() public payable notEnded {
        require(msg.value >= 1 ether);
        remainingVotes[msg.sender] += msg.value / 1e18;
        msg.sender.transfer(msg.value % 1e18);
    }
    function vote(uint256 candidateID, uint256 amountOfVotes) public notEnded {
        require(candidateID < candidates.length);
        require(remainingVotes[msg.sender] - amountOfVotes >= 0);
        remainingVotes[msg.sender] -= amountOfVotes;
        candidates[candidateID] += amountOfVotes;
    }
    function payoutVotes(uint256 amount) public notEnded {
        require(remainingVotes[msg.sender] >= amount);
        msg.sender.transfer(amount * 1e18);
        remainingVotes[msg.sender] -= amount;
    }
    function endVoting() public notEnded {
        require(msg.sender == owner);
        hasEnded = true;
        msg.sender.transfer(address(this).balance);
    }
    function displayBalanceInEther() public view returns (uint256) {
        return address(this).balance / 1e18;
    }
}
