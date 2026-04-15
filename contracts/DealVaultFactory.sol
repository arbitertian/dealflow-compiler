// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DealVault.sol";

contract DealVaultFactory {
    event DealCreated(
        address indexed vault,
        address indexed payer,
        address indexed arbiter,
        address settlementToken
    );

    function createDeal(
        address settlementToken_,
        address payer_,
        address arbiter_,
        address[] calldata payees_,
        uint16[] calldata payeeBps_,
        string[] calldata milestoneNames_,
        uint256[] calldata milestoneAmounts_,
        uint64[] calldata milestoneDueAts_,
        uint256 reserveAmount_,
        uint16 latePenaltyBps_
    ) external returns (address vault) {
        DealVault deal = new DealVault(
            settlementToken_,
            payer_,
            arbiter_,
            payees_,
            payeeBps_,
            milestoneNames_,
            milestoneAmounts_,
            milestoneDueAts_,
            reserveAmount_,
            latePenaltyBps_
        );

        vault = address(deal);
        emit DealCreated(vault, payer_, arbiter_, settlementToken_);
    }
}
