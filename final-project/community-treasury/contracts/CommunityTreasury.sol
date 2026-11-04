// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title CommunityTreasury
/// @notice A bounded teaching prototype: three fixed owners and two approvals per ETH payment.
/// @dev Approvals authorize exact, immutable payment fields. Submission is not an approval.
contract CommunityTreasury {
    uint256 public constant REQUIRED_CONFIRMATIONS = 2;
    address[3] public owners;
    mapping(address => bool) public isOwner;

    struct Transaction {
        address proposer;
        address to;
        uint256 value;
        bytes32 descriptionHash;
        bool executed;
        uint256 numConfirmations;
    }

    Transaction[] private transactions;
    mapping(uint256 => mapping(address => bool)) public isConfirmed;
    bool private entered;

    event Deposit(address indexed sender, uint256 amount, uint256 balance);
    event SubmitTransaction(
        address indexed owner,
        uint256 indexed txIndex,
        address indexed to,
        uint256 value,
        bytes32 descriptionHash
    );
    event ConfirmTransaction(address indexed owner, uint256 indexed txIndex);
    event RevokeConfirmation(address indexed owner, uint256 indexed txIndex);
    event ExecuteTransaction(address indexed owner, uint256 indexed txIndex);

    error NotOwner(address caller);
    error InvalidOwner(address owner);
    error DuplicateOwner(address owner);
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidDescriptionHash();
    error TransactionDoesNotExist(uint256 txIndex);
    error AlreadyExecuted(uint256 txIndex);
    error AlreadyConfirmed(uint256 txIndex, address owner);
    error NotConfirmed(uint256 txIndex, address owner);
    error NotEnoughConfirmations(uint256 actual, uint256 required);
    error InsufficientBalance(uint256 available, uint256 required);
    error TransferFailed(uint256 txIndex);
    error ReentrantCall();

    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner(msg.sender);
        _;
    }

    modifier nonReentrant() {
        if (entered) revert ReentrantCall();
        entered = true;
        _;
        entered = false;
    }

    constructor(address[3] memory initialOwners) {
        for (uint256 i; i < 3; ++i) {
            address owner = initialOwners[i];
            if (owner == address(0)) revert InvalidOwner(owner);
            if (isOwner[owner]) revert DuplicateOwner(owner);
            owners[i] = owner;
            isOwner[owner] = true;
        }
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    function submitTransaction(address to, uint256 value, bytes32 descriptionHash)
        external
        onlyOwner
        returns (uint256 txIndex)
    {
        if (to == address(0)) revert InvalidRecipient();
        if (value == 0) revert InvalidAmount();
        if (descriptionHash == bytes32(0)) revert InvalidDescriptionHash();
        txIndex = transactions.length;
        transactions.push(Transaction(msg.sender, to, value, descriptionHash, false, 0));
        emit SubmitTransaction(msg.sender, txIndex, to, value, descriptionHash);
    }

    function confirmTransaction(uint256 txIndex) external onlyOwner {
        Transaction storage transaction = pendingTransaction(txIndex);
        if (isConfirmed[txIndex][msg.sender]) revert AlreadyConfirmed(txIndex, msg.sender);
        isConfirmed[txIndex][msg.sender] = true;
        ++transaction.numConfirmations;
        emit ConfirmTransaction(msg.sender, txIndex);
    }

    function revokeConfirmation(uint256 txIndex) external onlyOwner {
        Transaction storage transaction = pendingTransaction(txIndex);
        if (!isConfirmed[txIndex][msg.sender]) revert NotConfirmed(txIndex, msg.sender);
        isConfirmed[txIndex][msg.sender] = false;
        --transaction.numConfirmations;
        emit RevokeConfirmation(msg.sender, txIndex);
    }

    function executeTransaction(uint256 txIndex) external onlyOwner nonReentrant {
        Transaction storage transaction = pendingTransaction(txIndex);
        if (transaction.numConfirmations < REQUIRED_CONFIRMATIONS) {
            revert NotEnoughConfirmations(transaction.numConfirmations, REQUIRED_CONFIRMATIONS);
        }
        if (address(this).balance < transaction.value) {
            revert InsufficientBalance(address(this).balance, transaction.value);
        }

        // Effects precede interaction. A failed recipient call reverts this effect too.
        transaction.executed = true;
        (bool success,) = transaction.to.call{value: transaction.value}("");
        if (!success) revert TransferFailed(txIndex);
        emit ExecuteTransaction(msg.sender, txIndex);
    }

    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    function getTransaction(uint256 txIndex)
        external
        view
        returns (
            address proposer,
            address to,
            uint256 value,
            bytes32 descriptionHash,
            bool executed,
            uint256 numConfirmations
        )
    {
        if (txIndex >= transactions.length) revert TransactionDoesNotExist(txIndex);
        Transaction storage transaction = transactions[txIndex];
        return (
            transaction.proposer,
            transaction.to,
            transaction.value,
            transaction.descriptionHash,
            transaction.executed,
            transaction.numConfirmations
        );
    }

    function pendingTransaction(uint256 txIndex) private view returns (Transaction storage transaction) {
        if (txIndex >= transactions.length) revert TransactionDoesNotExist(txIndex);
        transaction = transactions[txIndex];
        if (transaction.executed) revert AlreadyExecuted(txIndex);
    }
}
