pragma solidity ^0.4.11;

import "./contracts/oraclizeAPI_0.4.sol";

// Based on the Casino tutorial by Merunas Grincalaitis.
contract Casino is usingOraclize {
    address owner;

    // Minimum bet: 0.1 ether.
    uint public minimumBet = 100 finney;

    uint public totalBet;
    uint public numberOfBets;
    uint public maxAmountOfBets = 10;
    uint public constant LIMIT_AMOUNT_BETS = 100;
    uint public numberWinner;

    address[] public players;

    mapping(uint => address[]) numberBetPlayers;
    mapping(address => uint) playerBetsNumber;

    modifier onEndGame() {
        if (numberOfBets >= maxAmountOfBets) _;
    }

    function Casino(uint _minimumBet, uint _maxAmountOfBets) {
        owner = msg.sender;

        if (_minimumBet > 0) {
            minimumBet = _minimumBet;
        }

        if (
            _maxAmountOfBets > 0 &&
            _maxAmountOfBets <= LIMIT_AMOUNT_BETS
        ) {
            maxAmountOfBets = _maxAmountOfBets;
        }

        oraclize_setProof(proofType_Ledger);
    }

    function checkPlayerExists(address player) returns (bool) {
        if (playerBetsNumber[player] > 0) {
            return true;
        } else {
            return false;
        }
    }

    function bet(uint numberToBet) payable {
        assert(numberOfBets < maxAmountOfBets);
        assert(checkPlayerExists(msg.sender) == false);
        assert(numberToBet >= 1 && numberToBet <= 10);
        assert(msg.value >= minimumBet);

        playerBetsNumber[msg.sender] = numberToBet;
        numberBetPlayers[numberToBet].push(msg.sender);

        numberOfBets += 1;
        totalBet += msg.value;

        if (numberOfBets >= maxAmountOfBets) {
            generateNumberWinner();
        }
    }

    function generateNumberWinner() payable onEndGame {
        uint numberRandomBytes = 7;
        uint delay = 0;
        uint callbackGas = 200000;

        bytes32 queryId = oraclize_newRandomDSQuery(
            delay,
            numberRandomBytes,
            callbackGas
        );
    }

    function __callback(
        bytes32 _queryId,
        string _result,
        bytes _proof
    )
        oraclize_randomDS_proofVerify(_queryId, _result, _proof)
        onEndGame
    {
        assert(msg.sender == oraclize_cbAddress());

        numberWinner = (uint(sha3(_result)) % 10 + 1);
        distributePrizes();
    }

    function distributePrizes() onEndGame {
        uint winnerEtherAmount =
            totalBet / numberBetPlayers[numberWinner].length;

        for (
            uint i = 0;
            i < numberBetPlayers[numberWinner].length;
            i++
        ) {
            numberBetPlayers[numberWinner][i].transfer(
                winnerEtherAmount
            );
        }

        for (uint j = 1; j <= 10; j++) {
            numberBetPlayers[j].length = 0;
        }

        totalBet = 0;
        numberOfBets = 0;
    }
}
