// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface ITreasury {
    function executeTransaction(uint256 txIndex) external;
}

/// @dev Allows a failed transfer to be retried after recipient behavior changes.
contract ToggleReceiver {
    bool public acceptsPayment;
    function setAcceptsPayment(bool accepts) external { acceptsPayment = accepts; }
    receive() external payable { require(acceptsPayment, "recipient rejected payment"); }
}

/// @dev This receiver is also an owner, so access control alone cannot stop its reentry.
contract ReentrantOwnerReceiver {
    ITreasury public treasury;
    uint256 public reentryTarget;
    uint256 public attempts;
    bool public reentrySucceeded;
    bytes4 public revertSelector;

    function configure(address treasuryAddress, uint256 target) external {
        treasury = ITreasury(treasuryAddress);
        reentryTarget = target;
    }

    function trigger(uint256 txIndex) external { treasury.executeTransaction(txIndex); }

    receive() external payable {
        ++attempts;
        try treasury.executeTransaction(reentryTarget) {
            reentrySucceeded = true;
        } catch (bytes memory reason) {
            if (reason.length >= 4) {
                bytes4 selector;
                assembly { selector := mload(add(reason, 32)) }
                revertSelector = selector;
            }
        }
    }
}
