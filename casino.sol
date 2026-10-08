pragma solidity ^0.4.22;

import "./contracts/oraclizeAPI_0.4.sol";

// Based on the Merunas Grincalaitis Casino tutorial.
// Tutorial MIT license: see THIRD_PARTY_NOTICES.md.
contract Casino is usingOraclize {
    address public owner;
    uint public minimumBet = 100 finney;
    uint public totalBet;
    uint public numberOfBets;
    uint public maxAmountOfBets = 100;
    uint public constant LIMIT_AMOUNT_BETS = 100;
    uint public numberWinner;
    bool public awaitingDraw;
    bytes32 public pendingQueryId;

    address[] public players;
    mapping(uint => address[]) numberBetPlayers;
    mapping(address => uint) playerBetsNumber;

    event BetPlaced(address player, uint number, uint amount);
    event OracleRequested(bytes32 queryId);
    event RoundSettled(uint winner, uint pool, uint paid, uint carried);

    modifier onlyPendingCallback(bytes32 queryId) {
        require(msg.sender == oraclize_cbAddress());
        require(awaitingDraw && queryId == pendingQueryId);
        require(numberOfBets >= maxAmountOfBets);
        _;
    }

    function Casino(uint _minimumBet, uint _maxAmountOfBets) public {
        owner = msg.sender;
        if (_minimumBet > 0) minimumBet = _minimumBet;
        if (_maxAmountOfBets > 0) {
            require(_maxAmountOfBets <= LIMIT_AMOUNT_BETS);
            maxAmountOfBets = _maxAmountOfBets;
        }
        oraclize_setProof(proofType_Ledger);
    }

    // Owner-funded oracle reserve is separate from player stakes in totalBet.
    function fundOracle() public payable {
        require(msg.sender == owner);
    }

    function checkPlayerExists(address player) public view returns (bool) {
        return playerBetsNumber[player] != 0;
    }

    function bet(uint numberToBet) public payable {
        require(!awaitingDraw && numberOfBets < maxAmountOfBets);
        require(!checkPlayerExists(msg.sender));
        require(numberToBet >= 1 && numberToBet <= 10);
        require(msg.value >= minimumBet);
        require(msg.value <= uint(-1) - totalBet);

        playerBetsNumber[msg.sender] = numberToBet;
        numberBetPlayers[numberToBet].push(msg.sender);
        players.push(msg.sender);
        numberOfBets += 1;
        totalBet += msg.value;
        emit BetPlaced(msg.sender, numberToBet, msg.value);
        if (numberOfBets == maxAmountOfBets) generateNumberWinner();
    }

    function generateNumberWinner() internal {
        require(!awaitingDraw && numberOfBets >= maxAmountOfBets);
        awaitingDraw = true;
        // Budget for clearing and paying a large round. Live oracle proof
        // verification, fees and availability still need Sepolia validation.
        pendingQueryId = oraclize_newRandomDSQuery(0, 7, 5000000);
        require(pendingQueryId != bytes32(0));
        if (totalBet > address(this).balance) totalBet = address(this).balance;
        emit OracleRequested(pendingQueryId);
    }

    function __callback(bytes32 _queryId, string _result, bytes _proof)
        public
        onlyPendingCallback(_queryId)
        oraclize_randomDS_proofVerify(_queryId, _result, _proof)
    {
        numberWinner = uint(keccak256(_result)) % 10 + 1;
        distributePrizes();
    }

    function distributePrizes() internal {
        require(awaitingDraw && numberOfBets >= maxAmountOfBets);
        uint pool = totalBet;
        if (pool > address(this).balance) pool = address(this).balance;
        address[] memory winners = numberBetPlayers[numberWinner];
        uint share = 0;
        if (winners.length > 0) share = pool / winners.length;
        uint paid = share * winners.length;

        // Clear every participant, including losers, before paying winners.
        for (uint i = 0; i < players.length; i++) {
            delete playerBetsNumber[players[i]];
        }
        players.length = 0;
        for (uint j = 1; j <= 10; j++) delete numberBetPlayers[j];
        numberOfBets = 0;
        awaitingDraw = false;
        pendingQueryId = bytes32(0);

        // With no winners, the pool carries into the next round. Integer
        // division remainders also carry rather than becoming unaccounted ETH.
        totalBet = pool - paid;
        for (uint k = 0; k < winners.length; k++) winners[k].transfer(share);
        emit RoundSettled(numberWinner, pool, paid, totalBet);
    }
}
