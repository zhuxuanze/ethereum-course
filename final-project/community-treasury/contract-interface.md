# CommunityTreasury contract interface

This is a bounded educational prototype, not an audited custody product. All owners and the two-approval threshold are fixed at deployment. There is no administrator escape hatch, upgrade function, owner replacement, token issuance, or owner rotation. The application addresses approvals for ETH already held by the treasury; it cannot determine whether an expense is legitimate.

## Constructor and public reads

- `constructor(address[3] initialOwners)` rejects zero and duplicate owner addresses.
- `owners(uint256) returns (address)` uses indices 0–2.
- `isOwner(address) returns (bool)`.
- `REQUIRED_CONFIRMATIONS() returns (uint256)` is always 2.
- `getTransactionCount() returns (uint256)`.
- `getTransaction(uint256 txIndex) returns (address proposer, address to, uint256 value, bytes32 descriptionHash, bool executed, uint256 numConfirmations)`.
- `isConfirmed(uint256 txIndex, address owner) returns (bool)`.

## Public writes

All request actions require an owner account. Submission does not implicitly approve the request.

- Send native ETH with empty calldata to deposit. `receive()` is payable.
- `submitTransaction(address to, uint256 value, bytes32 descriptionHash) returns (uint256 txIndex)` creates an immutable request. Recipient, amount and hash must be nonzero.
- `confirmTransaction(uint256 txIndex)` records the caller's one approval.
- `revokeConfirmation(uint256 txIndex)` withdraws the caller's approval before execution.
- `executeTransaction(uint256 txIndex)` requires two current approvals and enough ETH. A separate transaction explicitly executes payment. It is not triggered automatically by the second approval. A request executes at most once.

Changing any recipient, amount or purpose requires a new request. An old unexecuted request remains pending; owners should revoke their approvals if they no longer authorize it. There is no cancellation state in this bounded version. Pending requests do not reserve funds; sufficient balance is checked at execution time.

## Events

- `Deposit(address indexed sender, uint256 amount, uint256 balance)`
- `SubmitTransaction(address indexed owner, uint256 indexed txIndex, address indexed to, uint256 value, bytes32 descriptionHash)`
- `ConfirmTransaction(address indexed owner, uint256 indexed txIndex)`
- `RevokeConfirmation(address indexed owner, uint256 indexed txIndex)`
- `ExecuteTransaction(address indexed owner, uint256 indexed txIndex)`

The purpose is stored off chain. Use `ethers.keccak256(ethers.toUtf8Bytes(description))` for its on-chain commitment. The UI must compare the exact stored string's hash with `descriptionHash`, flag mismatches, and never substitute an unverified description without notice. This commitment detects changed text but does not guarantee the description's availability or truth.

## Security and operational boundaries

Execution uses checks-effects-interactions and a reentrancy guard. A rejected recipient transfer reverts the executed flag and leaves approvals and funds available for retry. Approval counts represent distinct owner addresses, not proof of distinct humans. Two owners can authorize an inappropriate expense, and loss of two owner keys can permanently block payment. Public transaction fields are not confidential. Test coverage is evidence for the exercised cases, not a formal proof or a security audit. The fixed membership makes scope manageable but limits recovery and long-term administration.

## Compilation

`node scripts/compile.mjs` compiles pinned Solidity 0.8.30 with optimizer 200 and the Shanghai EVM target for Ganache compatibility. `artifacts/CommunityTreasury.json` contains ABI, creation bytecode, runtime bytecode, source SHA-256 and compiler settings. Test-only receiver artifacts are not part of the production treasury interface.
