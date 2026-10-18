# Assignment / Lab #3: Ethereum Storage, Solidity, and Contract Interaction

Course: Introduction to Ethereum and Cloud Blockchain Solutions Engineering. Reference date: 18 October 2026. Solidity 0.5.17 is used for the storage and Hello World exercises; Question 6 retains the assignment's Solidity 0.4.24 semantics. Compiler target, execution environment, and network are recorded separately because they determine different aspects of behavior.

## 1(a)

**Storage persists; memory is temporary.** A contract's storage is part of Ethereum's persistent state and survives successful transactions. It is logically a mapping from 256-bit slot keys to 256-bit values. Updating it changes the state that nodes maintain and is relatively expensive. Memory is a byte-addressed working area created separately for each EVM message call. It holds temporary values during execution, expands when needed, and does not survive the call. Memory operations also consume gas, including expansion costs. [S1](https://docs.soliditylang.org/en/v0.5.17/introduction-to-smart-contracts.html#storage-memory-and-the-stack)

In `StorageTest`, `bytes32[] b` is a state variable in storage. The parameter `_b` has the explicit data location `memory`. Assigning `b = _b` copies the supplied array into persistent storage; changing the temporary parameter alone would not persist that data.

## 1(b)

The historical schedule charges more for zero-to-nonzero writes because they create persistent state that nodes must retain. Replacing an existing nonzero value generally does not create an additional occupied slot, while clearing a slot reduces the live state burden. Zero is also the default value of an unoccupied storage location, so writing a fresh nonzero value is materially different from returning a location to its default.

The assignment's 20,000/5,000 figures describe an older simplified schedule. EIP-2200 distinguishes original, current, and new values, including cheaper unchanged writes and a refund counter for qualifying clears. EIP-2929 subsequently adds cold/warm access accounting. Thus, “every other write costs exactly 5,000” is not a universal rule for later forks. [S2](https://eips.ethereum.org/EIPS/eip-2200) [S3](https://eips.ethereum.org/EIPS/eip-2929)

Refunds are an incentive for cleaning up state, rather than a payment that makes arbitrary deletion free. Under the London/Shanghai rules relevant to the local comparison, EIP-3529 reduced the qualifying clear refund and limited total refunds to one fifth of gas used. These refund details must not be assumed to describe every later network fork. [S4](https://eips.ethereum.org/EIPS/eip-3529)

## 1(c)

One kibibyte is 1,024 bytes. A `bytes32` value occupies 32 bytes, so the simplified estimate contains 1,024 / 32 = 32 fresh, nonzero storage words. Using the assignment's zero-to-nonzero price:

```text
SSTORE-only estimate = 32 × 20,000 = 640,000 gas
ETH cost = 640,000 × g × 10^-9 = 0.00064g ETH
USD cost = 0.00064 × g × p
```

Here, `g` is the usual gas price in gwei and `p` is USD per ETH. The Etherscan snapshot is:

| Observation | Recorded value |
| --- | --- |
| Capture time, UTC | 2026-10-18T11:17:35.380952+00:00 |
| Gas Tracker category | Standard |
| Usual gas price, gwei | 0.038 |
| ETH price, USD | 2416.07 |
| SSTORE-only estimate, ETH | 0.000024320000 |
| SSTORE-only estimate, USD | 0.05875882 |

The price observations come from the gas-tier card and ETH/USD header on [Etherscan Gas Tracker](https://etherscan.io/gastracker). The captured HTML and exact decimal calculations are preserved in `evidence/gas-quote.json` and its linked source snapshot. The timestamp records retrieval time; fees and exchange rates change. This intentionally excludes transaction overhead, cold-slot charges, and array metadata, as requested. The monetary amount is an estimate for a mainnet transaction at the quoted rate, rather than a price for purchasing testnet ETH.

## 1(d)

The tested source is the assignment's `StorageTest` contract, with `put(bytes32[] memory _b)` assigning `_b` to the storage array. The input is exactly 32 nonzero `bytes32` values: the first byte runs from hexadecimal `01` through `20`, and the remaining 31 bytes of each value are zero. That is exactly 1,024 payload bytes. The complete input is supplied in `evidence/storage-input.json`.

The measurement uses a fresh deployment and the first `put` call. Repeating the same call against already populated slots would measure a different write transition and would not be a valid fresh-storage comparison.

| Remix measurement | Recorded value |
| --- | --- |
| Execution environment | Remix VM (Shanghai) |
| Compiler | 0.5.17+commit.d19bba13 |
| Optimizer setting | Disabled |
| Compiler EVM target | Istanbul |
| `put` transaction hash in the VM | 0x1a3042b54f6b3dba8dbedf901cf6c018b6e7f8fe4895e532a009fb31a053295e |
| Receipt gas used / transaction cost | 758,364 gas |
| ETH equivalent at the 1(c) quotation | 0.000028817832 ETH |
| USD equivalent at the 1(c) quotation | 0.06962590 USD |

The conversion is `receipt gasUsed × GAS_QUOTE_GWEI × 10^-9 × ETH_USD_QUOTE`. Deployment gas is excluded because the question measures the transaction that stores the data. VM currency is simulated; the USD figure is a mainnet-rate equivalent, not a fee actually paid in Remix.

A separate local Shanghai-chain reproduction reports **758,364 gas** and checks all 32 stored words and the array length. It is supporting evidence and is not labeled a Remix or Sepolia transaction.

Fork selection matters. The Ethereum Foundation's 16 October 2026 announcement confirms that Sepolia activated Glamsterdam on 6 October, while mainnet activation remained undecided. Therefore the Shanghai VM measurement cannot be presented as a measurement of current Sepolia gas accounting. [S19](https://blog.ethereum.org/en/2026/10/16/glamsterdam-hoodi-announcement)

## 1(e)

The measured **gas used** is higher than the simplified estimate for three groups of reasons:

1. **Transaction and calldata costs.** The transaction pays intrinsic gas and charges for its ABI-encoded input, including the selector, offset, length, and array words. In the Shanghai execution model, zero and nonzero calldata bytes have different prices. [S8](https://eips.ethereum.org/EIPS/eip-2028)
2. **Extra storage accounting.** A dynamic array stores its length in an additional slot. The first assignment therefore persists metadata as well as the 32 data words. Fresh storage accesses also incur the applicable cold-access charges. [S7](https://docs.soliditylang.org/en/v0.5.17/miscellaneous.html#mappings-and-dynamic-arrays) [S3](https://eips.ethereum.org/EIPS/eip-2929)
3. **Execution and memory work.** Function dispatch, ABI decoding, memory allocation and copying, bounds/control-flow operations, and hashing the dynamic array's storage location consume gas beyond the selected `SSTORE` operations. [S7](https://docs.soliditylang.org/en/v0.5.17/miscellaneous.html)

The question calls this a higher “gas price,” but the experiment principally compares **gas quantities**. Gas price is the amount paid per gas unit; transaction fee is gas used multiplied by the effective gas price.

## 2(a)

A **multisignature wallet** requires approvals from a configured threshold of authorized owners before executing protected operations, such as two approvals out of three owners. It can reduce the risk that one compromised key controls all funds. The precise policy can include exceptions, such as a daily spending limit.

**Parity** here refers to the Ethereum client and wallet software developed by Parity Technologies, including its historical multisignature wallet contracts. The original source describes a wallet proxy and shared wallet-library logic, with owner approvals and daily-limit mechanisms. The incident in this question is the **first Parity multisig attack in July 2017**. [S9](https://raw.githubusercontent.com/openethereum/parity-ethereum/4d08e7b0aec46443bf26547b17d10cb302672835/js/src/contracts/snippets/enhanced-wallet.sol)

## 2(b)

`initWallet()` is an ordinary callable initialization function, despite its “constructor” comment. In the historical Solidity version, omitting an access modifier left it publicly callable. It had no effective one-time initialization guard and reset security-critical ownership and spending parameters. The wallet's fallback delegated unmatched calls to the shared library, so a caller could reach the initializer and modify the wallet's own storage. An attacker first reinitialized the wallet under attacker-controlled ownership and then executed a transfer with that authority. [S9](https://raw.githubusercontent.com/openethereum/parity-ethereum/4d08e7b0aec46443bf26547b17d10cb302672835/js/src/contracts/snippets/enhanced-wallet.sol) [S10](https://www.openzeppelin.com/news/on-the-parity-wallet-multisig-hack-405a8c12e8f7)

Prevention requires controlling initialization itself: use a genuine constructor for a non-proxy contract, or an initializer that is callable exactly once through the intended deployment process and rejects every later attempt. Set its initialized flag before external interactions, validate owner/threshold inputs, and expose only intended library entry points. Explicit visibility, security review, and tests that attempt reinitialization after deployment would help detect the defect. Merely changing the comment would change nothing. This is the July ownership-reset exploit, rather than the separate November library-destruction incident. [S10](https://www.openzeppelin.com/news/on-the-parity-wallet-multisig-hack-405a8c12e8f7)

## 3

The distinctions below use **Solidity 0.5.17**, matching the compilation used for Questions 1 and 5.

| Construct | Main purpose and restrictions |
| --- | --- |
| Abstract contract | An incomplete base implementation. It can contain state, constructors, implemented functions, and function declarations without bodies. A derived contract must implement the missing functions before it can be deployed as a concrete contract. |
| Interface | An externally callable API specification. In 0.5.17, functions have no implementations and must be `external`; there are no state variables or constructors, and interfaces cannot inherit other contracts or interfaces. |
| Library | Reusable utility code rather than an independently stateful application. It cannot have ordinary state variables or participate in contract inheritance. Internal library functions are incorporated into the caller; external/public library calls generally use `DELEGATECALL`, allowing supplied storage references to refer to the caller's storage. |

An abstract contract shares partial implementation, an interface specifies an interaction boundary, and a library shares algorithms. Neither an interface nor an incomplete abstract contract can be directly deployed as a complete application. [S11](https://docs.soliditylang.org/en/v0.5.17/contracts.html#abstract-contracts)

Version differences matter: Solidity 0.5.x makes incomplete contracts implicitly abstract. Solidity 0.6 introduced the explicit `abstract` keyword, explicit overriding rules, and interface inheritance. Those newer rules should not be projected onto the assignment's 0.5.17 examples. [S12](https://www.soliditylang.org/blog/2020/06/18/solidity-0.6-inheritance/)

## 4(a)

**True in terms of the state-access guarantee.** A `view` function promises not to modify state; a `pure` function additionally promises not to read state. Consequently a pure function satisfies the behavioral restriction of view, and Solidity permits conversion from a compatible pure function type to view. This does not mean a function's declaration literally contains both keywords. [S13](https://docs.soliditylang.org/en/v0.5.17/types.html#function-types)

## 4(b)

**False.** A mined transaction calling a view function still consumes gas and pays a transaction fee, even if the contract state is unchanged. A read-only `eth_call` evaluates the function without creating a blockchain transaction and does not charge the caller an on-chain fee. Applications commonly choose `eth_call` automatically for view functions, which explains the apparent free-call behavior. Execution still has resource limits. [S14](https://ethereum.org/developers/docs/transactions/) [S24](https://ethereum.org/developers/docs/apis/json-rpc/#eth_call)

## 4(c)

**False.** A non-payable entry point rejects an ordinary value-bearing call, but Ether can be forced into a contract without executing one of its payable functions, for example by another contract's `SELFDESTRUCT` naming it as beneficiary. Contract balances can also be funded at an address before the contract is deployed there. Therefore a contract must not assume its actual balance equals only the payments recorded by its own functions. [S27](https://docs.soliditylang.org/en/v0.5.17/security-considerations.html#sending-and-receiving-ether)

EIP-6780 restricted when `SELFDESTRUCT` deletes code and storage, but retained balance transfer to the beneficiary. Thus the modern restriction does not rescue the statement. [S15](https://eips.ethereum.org/EIPS/eip-6780)

## 4(d)

**False.** `int` and `uint` are aliases for `int256` and `uint256`, not 32-bit integers. Each has **2^256** distinct values. Their ranges differ: `uint256` ranges from 0 to 2^256 − 1; `int256` ranges from −2^255 to 2^255 − 1. The EVM's 32-byte word means 256 bits, not 32 bits. [S13](https://docs.soliditylang.org/en/v0.5.17/types.html#integers)

## 4(e)

**True under the traditional model assumed by the course; false as an unconditional statement on present Ethereum.** Traditionally, `tx.origin` is the transaction-originating EOA and `msg.sender` is the immediate caller. Equality indicates the top-level execution frame, because an intervening contract call normally changes `msg.sender`.

EIP-7702 allows an EOA to delegate execution to code. A self-sponsored originating account can execute delegated code and call another contract while that recipient still sees `msg.sender == tx.origin`. The EIP explicitly identifies the loss of the “topmost frame only” invariant. The address may still be an EOA, but equality no longer proves that no executable contract code intervened. This test is therefore unsuitable as a general “no contracts” or reentrancy defense. [S16](https://eips.ethereum.org/EIPS/eip-7702#self-sponsoring-allowing-txorigin-to-set-code)

## 5(a)

A **test network** is a separate blockchain used to test applications and protocol behavior before using mainnet. It has its own chain identifier, balances, and transaction history. An account address can be used on multiple networks, but its ETH balances are separate. Testnet ETH is intended for testing and is commonly distributed by free faucets. Testing there allows compilation, deployment, wallet, and contract-interaction mistakes to be discovered without spending mainnet ETH. A local development chain is useful for fast repeatable tests, while a public testnet additionally exercises public network and wallet integration. [S17](https://ethereum.org/developers/docs/networks)

## 5(b)

As of 18 October 2026, the relevant maintained public Ethereum testnets are **Sepolia and Hoodi**. A simple ranking by “largest” is less useful than their different purposes:

| Network | Intended use | Main distinction |
| --- | --- | --- |
| Sepolia | Smart-contract and application development | Recommended default for dApp testing; permissioned validator set managed by client/testing teams. This is the network required for this assignment. |
| Hoodi | Validator, staking, and protocol-upgrade testing | Open validator participation, with larger state and greater synchronization/storage requirements. |

Both use proof of stake, but target different testing audiences. Older tutorials mentioning Ropsten, Rinkeby, Kovan, or Goerli should be read historically; they are not the present default deployment choices. Ropsten historically used proof of work, while Rinkeby and Kovan used proof of authority. [S17](https://ethereum.org/developers/docs/networks) [S18](https://blog.ethereum.org/2022/06/21/testnet-deprecation)

At the report date, Sepolia has already upgraded to Glamsterdam. Hoodi's activation is scheduled for 26 October 2026, and mainnet's date is still to be announced. These different fork states can produce different gas behavior even for identical bytecode. [S19](https://blog.ethereum.org/en/2026/10/16/glamsterdam-hoodi-announcement)

## 5(c)

The practical work reuses the existing MetaMask **Account 2**, address **0xf022a488D7730A66D9Aa986077162425CA910200**, on Sepolia, chain ID 11155111. Its observed starting balance was approximately **4.391 Sepolia ETH**, sufficient for these test transactions.

This run did not create a new account or obtain a new faucet payout: it reused the already funded account. No mainnet ETH purchase or faucet deposit was needed for the recorded work. The wallet evidence establishes the selected network, account, and available testing balance; it is not evidence of a newly completed faucet transfer. No seed phrase or private key is included in the submission.

## 5(d)

`contracts/HelloWorld.sol` contains:

```solidity
pragma solidity ^0.5.1;

contract HelloWorld {
    function hello() public pure returns (string memory) {
        return "Hello, world!";
    }
}
```

The compiler is pinned to **0.5.17**, satisfying the requirement for version 0.5.1 or newer. The return string preserves the required capital letter, comma, space, and exclamation mark. `pure` is appropriate because the function only returns a literal and neither reads nor modifies persistent state.

## 5(e)

The repository installs the pinned `solc` JavaScript distribution as `solc-0.5.17`. Running `npm ci` followed by `npm run compile` compiles through the standard JSON interface. For Hello World, the recorded settings enable optimization with **200 runs** and target the **Istanbul EVM**. The compiler version and full input/output are retained with the artifacts.

The generated outputs include `artifacts/HelloWorld/creation.bin`, `runtime.bin`, and `abi.json`. The standard JSON output distinguishes `evm.bytecode` and `evm.deployedBytecode`, and the optimizer settings are compilation inputs rather than deployment-time switches. [S21](https://docs.soliditylang.org/en/v0.5.16/using-the-compiler.html) [S22](https://docs.soliditylang.org/en/latest/using-the-compiler.html)

The **application binary interface (ABI)** describes externally accessible functions and their inputs, outputs, and mutability. Wallets and client libraries use it to encode function calls and decode return data; it is not the executable contract bytecode. For `hello()`, it records no inputs and one `string` output. The first four call-data bytes are the function selector; return data follows the ABI's dynamic-string encoding. [S20](https://docs.soliditylang.org/en/v0.5.17/abi-spec.html)

## 5(f)

In the native Solidity CLI, **`--bin`** emits creation bytecode: initialization code that executes during contract creation and returns the runtime program. **`--bin-runtime`** emits only the runtime bytecode that will be stored at the deployed address and executed on later calls. The native CLI labels these outputs separately. [S23](https://github.com/argotorg/solidity/blob/develop/solc/CommandLineInterface.cpp)

Use **creation bytecode (`--bin`) for deployment**, with ABI-encoded constructor arguments appended when required. Runtime bytecode alone is generally not the correct deployment transaction payload. This project obtains the equivalent outputs through standard JSON as `evm.bytecode.object` and `evm.deployedBytecode.object`; it does not assume that the solc-js CLI supports every native CLI flag. [S21](https://docs.soliditylang.org/en/v0.5.16/using-the-compiler.html) [S22](https://docs.soliditylang.org/en/latest/using-the-compiler.html)

## 5(g)

The direct type-2 Sepolia deployment and the transaction carrying the function call are recorded separately:

| Evidence | Recorded value |
| --- | --- |
| Deployed contract | [0x5eeb0043117380d3e1cbf0b8424459291e1aabb5](https://sepolia.etherscan.io/address/0x5eeb0043117380d3e1cbf0b8424459291e1aabb5) |
| Deployment transaction | [0xa9511ae0f8e96abf1f9eb8c1aec8e04be846db521d8435257a3cc96be7e2e993](https://sepolia.etherscan.io/tx/0xa9511ae0f8e96abf1f9eb8c1aec8e04be846db521d8435257a3cc96be7e2e993) |
| Wallet transaction carrying the `hello()` call | [0x8b950980dd75980694d889c651c7bf42f96c0b62ef242e0b0d12290f3108c9f8](https://sepolia.etherscan.io/tx/0x8b950980dd75980694d889c651c7bf42f96c0b62ef242e0b0d12290f3108c9f8) |
| Call-transaction receipt status | Success (1) |
| Whole wallet/batch transaction gas used | 195,438 gas |
| Separately decoded `eth_call` result | Hello, world! |

To meet the transaction requirement, the `hello()` calldata was submitted in an actual signed transaction, even though the ABI correctly identifies the function as pure. This is distinct from the separate read-only call. Changing a local ABI's legacy `constant` hint can influence how an old client sends a call, but does not alter deployed bytecode or the function's actual behavior.

MetaMask wrapped the requested call in wallet execution. Its documented EIP-7702 Delegator is `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`, matching the account's observed delegation. The successful retry was a type-2 transaction using that existing delegation; its outer target was the DelegationManager. The decoded payload contained exactly one zero-value inner call to the deployed Hello World address with selector `0x19ff1d21`. The all-zero execution mode selected default execution, which reverts on inner-call failure. Combined with receipt status 1 in block 11,940,802, this establishes that the inner call succeeded. The verification is preserved in `evidence/sepolia-results.json`. [S28](https://support.metamask.io/configure/accounts/what-is-a-smart-account/) [S29](https://raw.githubusercontent.com/MetaMask/delegation-framework/v1.3.0/src/EIP7702/EIP7702DeleGatorCore.sol)

The reported **195,438 gas** covers the entire successful wallet transaction, including wrapper overhead; it is not the standalone execution cost of `hello()`.

The [first wrapped attempt](https://sepolia.etherscan.io/tx/0x80d3129fa81e01d84fc72ca85a69292426225a7f49617faf86f772f8db42b423) was a type-4 transaction with receipt status 0. It is archived in `evidence/sepolia-failed-hello.json` and excluded from the successful result above. High gas utilization alone does not prove out-of-gas, and the available RPC did not provide an execution trace.

**The normal transaction receipt has no Solidity return-value field.** Etherscan shows inclusion/status, gas, and input data; its decoded input is not the function output. A separate `eth_call` to the deployed contract returned ABI-encoded bytes that decoded to exactly **`Hello, world!`**, as recorded in `evidence/sepolia-results.json`. On a verified contract, Etherscan's **Read Contract** interface can also make a read call, but that is a fresh evaluation rather than a return value stored in the original transaction receipt. A supported execution trace is another way to inspect a transaction's execution return data. [S24](https://ethereum.org/developers/docs/apis/json-rpc/#eth_call) [S20](https://docs.soliditylang.org/en/v0.5.17/abi-spec.html)

## 6(a)

`Dangerous` is a simple Ether deposit/withdrawal ledger. `depositMoney()` accepts Ether and increases `deposits[msg.sender]` by `msg.value`. `withdraw(amount)` checks whether the caller has enough recorded credit, sends that amount to the caller, then subtracts it from the caller's credit. Ether belonging to different depositors is pooled in the contract's actual balance, while the mapping tracks their individual entitlements.

The intended invariant is that a caller cannot withdraw more than its credited deposits. The ordering in `withdraw` breaks that intention because it transfers control before updating the credit.

## 6(b)

The highlighted expression, `msg.sender.call.value(amount)()`, performs a **low-level EVM `CALL`** to the caller's address, sending `amount` wei and empty calldata. If the recipient is a contract, its payable fallback can execute. The call forwards the available gas subject to the EVM's call-gas rule; it is not limited to the 2,300-gas behavior associated with `send` or `transfer`. In Solidity 0.4.24 it returns a Boolean success indicator. [S25](https://docs.soliditylang.org/en/v0.4.24/units-and-global-variables.html#address-related)

The surrounding `if (!...){ revert(); }` makes a failed payment revert the withdrawal. It does not stop a successful recipient from calling back into `Dangerous` before the subsequent `deposits[msg.sender] -= amount` executes.

## 6(c)

The defect is **reentrancy through an external call made before its accounting effect**. A recipient contract can first deposit a small amount and request a withdrawal. When `Dangerous` transfers Ether to that contract, its fallback calls `withdraw` again. Every nested check sees credit that has not yet been reduced by the pending outer withdrawal, allowing the same credit to authorize multiple payments funded partly by other users' deposits. [S26](https://docs.soliditylang.org/en/v0.4.24/security-considerations.html#re-entrancy)

The issue does not require parallel execution: the nested calls occur synchronously in one transaction. Solidity 0.4.24 also uses wrapping unsigned arithmetic, so repeated decrements while the call stack unwinds can corrupt the mapping through underflow. That arithmetic behavior is an additional consequence; the security-design error is allowing untrusted code to run while the withdrawal credit is still available. A fix must restore the accounting invariant before external interaction.

## 6(d)

**Not completed.** The runnable attack-contract implementation and local reentrancy reproduction requested in this subquestion have not been completed. No attack source, attack transaction, or experimental drain result is claimed in this submission. The vulnerability analysis in 6(c) and the defensive repair in 6(e) are provided, but they do not fulfill the separate request to implement the attack. The functional storage/Hello World experiments in `evidence/local-results.json` do not test reentrancy.

## 6(e)

Apply **Checks-Effects-Interactions (CEI)**: validate the credit, deduct it, and only then transfer control. In the assignment's 0.4.24 syntax, the core repair is:

```solidity
function withdraw(uint amount) public {
    require(deposits[msg.sender] >= amount);
    deposits[msg.sender] -= amount;
    if (!msg.sender.call.value(amount)()) {
        revert();
    }
}
```

If payment fails, `revert()` rolls back the preceding deduction as well. If the recipient reenters, the check sees the already reduced balance, so it cannot reuse credit that is being paid out. A reentrancy lock can add protection, especially when multiple external entry points share an invariant. The same ordering must cover every relevant withdrawal path. [S27](https://docs.soliditylang.org/en/v0.5.17/security-considerations.html#use-the-checks-effects-interactions-pattern)

This is a source-level defensive repair, not a claim that a fixed-contract reentrancy regression was executed. Such validation should establish that other depositors' funds remain protected and that a legitimate deposit followed by a legitimate withdrawal still works. Restricting gas with `transfer`, changing the ABI, or checking `tx.origin` is not a substitute for correct accounting and reentrancy protection. [S16](https://eips.ethereum.org/EIPS/eip-7702)

## References

All sources were accessed on **18 October 2026**. Versioned Solidity documentation is used where historical language behavior matters. The assignment PDF supplies the question wording and original laboratory contracts; it is distinct from the research sources below.

- **S1.** Solidity team. [Introduction to Smart Contracts, v0.5.17](https://docs.soliditylang.org/en/v0.5.17/introduction-to-smart-contracts.html).
- **S2.** Ethereum Improvement Proposals. [EIP-2200: Structured Definitions for Net Gas Metering](https://eips.ethereum.org/EIPS/eip-2200).
- **S3.** Ethereum Improvement Proposals. [EIP-2929: Gas Cost Increases for State Access Opcodes](https://eips.ethereum.org/EIPS/eip-2929).
- **S4.** Ethereum Improvement Proposals. [EIP-3529: Reduction in Refunds](https://eips.ethereum.org/EIPS/eip-3529).
- **S5.** Etherscan. [Ethereum Gas Tracker](https://etherscan.io/gastracker). The time-specific observation is documented in Question 1(c).
- **S6.** Etherscan. [ETH/USD Quotation Embedded in Gas Tracker](https://etherscan.io/gastracker). The time-specific observation and source snapshot are documented in Question 1(c).
- **S7.** Solidity team. [Miscellaneous: Storage and Memory Layout, v0.5.17](https://docs.soliditylang.org/en/v0.5.17/miscellaneous.html).
- **S8.** Ethereum Improvement Proposals. [EIP-2028: Transaction Data Gas Cost Reduction](https://eips.ethereum.org/EIPS/eip-2028).
- **S9.** Parity/OpenEthereum source repository. [Historical `enhanced-wallet.sol`, commit `4d08e7b0aec46443bf26547b17d10cb302672835`](https://raw.githubusercontent.com/openethereum/parity-ethereum/4d08e7b0aec46443bf26547b17d10cb302672835/js/src/contracts/snippets/enhanced-wallet.sol).
- **S10.** Santiago Palladino, OpenZeppelin. [The Parity Wallet Hack Explained](https://www.openzeppelin.com/news/on-the-parity-wallet-multisig-hack-405a8c12e8f7), 19 July 2017. Contemporary analysis by its original authors.
- **S11.** Solidity team. [Contracts, v0.5.17](https://docs.soliditylang.org/en/v0.5.17/contracts.html).
- **S12.** Elena Gesheva, Solidity team. [Solidity 0.6.x Features: Inheritance](https://www.soliditylang.org/blog/2020/06/18/solidity-0.6-inheritance/), 18 June 2020.
- **S13.** Solidity team. [Types, v0.5.17](https://docs.soliditylang.org/en/v0.5.17/types.html).
- **S14.** Ethereum.org. [Transactions](https://ethereum.org/developers/docs/transactions/).
- **S15.** Ethereum Improvement Proposals. [EIP-6780: SELFDESTRUCT Only in Same Transaction](https://eips.ethereum.org/EIPS/eip-6780).
- **S16.** Ethereum Improvement Proposals. [EIP-7702: Set Code for EOAs](https://eips.ethereum.org/EIPS/eip-7702).
- **S17.** Ethereum.org. [Networks](https://ethereum.org/developers/docs/networks).
- **S18.** Ethereum Foundation Protocol Support Team. [Ropsten, Rinkeby & Kiln Deprecation Announcement](https://blog.ethereum.org/2022/06/21/testnet-deprecation), 21 June 2022.
- **S19.** Ethereum Foundation Protocol Cluster. [Glamsterdam Hoodi Testnet Announcement](https://blog.ethereum.org/en/2026/10/16/glamsterdam-hoodi-announcement), 16 October 2026.
- **S20.** Solidity team. [Contract ABI Specification, v0.5.17](https://docs.soliditylang.org/en/v0.5.17/abi-spec.html).
- **S21.** Solidity team. [Using the Compiler, v0.5.16](https://docs.soliditylang.org/en/v0.5.16/using-the-compiler.html). Used for the native CLI/standard JSON interface; the actual compiler in this submission is pinned to 0.5.17.
- **S22.** Solidity team. [Using the Compiler, current documentation](https://docs.soliditylang.org/en/latest/using-the-compiler.html). Used for output naming and native CLI/solc-js distinctions.
- **S23.** Solidity compiler source repository. [Native CLI Output Handling](https://github.com/argotorg/solidity/blob/develop/solc/CommandLineInterface.cpp). Used to distinguish binary and runtime-binary outputs.
- **S24.** Ethereum.org. [JSON-RPC API: `eth_call` and Transaction Receipts](https://ethereum.org/developers/docs/apis/json-rpc/).
- **S25.** Solidity team. [Units and Globally Available Variables, v0.4.24](https://docs.soliditylang.org/en/v0.4.24/units-and-global-variables.html).
- **S26.** Solidity team. [Security Considerations, v0.4.24](https://docs.soliditylang.org/en/v0.4.24/security-considerations.html).
- **S27.** Solidity team. [Security Considerations, v0.5.17](https://docs.soliditylang.org/en/v0.5.17/security-considerations.html).
- **S28.** MetaMask Help Center. [What Is a Smart Account](https://support.metamask.io/configure/accounts/what-is-a-smart-account/). EIP-7702 transaction batching and the MetaMask Delegator implementation address.
- **S29.** MetaMask Delegation Framework. [EIP7702DeleGatorCore, v1.3.0](https://raw.githubusercontent.com/MetaMask/delegation-framework/v1.3.0/src/EIP7702/EIP7702DeleGatorCore.sol). Default and try execution modes.
