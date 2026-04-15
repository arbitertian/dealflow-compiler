// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract DealVault {
    struct Milestone {
        string name;
        uint256 amount;
        uint64 dueAt;
        bool released;
    }

    IERC20Minimal public immutable settlementToken;
    address public immutable payer;
    address public immutable arbiter;
    uint256 public immutable totalBudget;
    uint256 public immutable reserveAmount;
    uint16 public immutable latePenaltyBps;

    uint256 public totalFunded;
    uint256 public totalMilestoneAmount;
    uint256 public releasedMilestoneCount;
    bool public closed;

    address[] private _payees;
    uint16[] private _payeeBps;
    Milestone[] private _milestones;

    uint256 private _locked = 1;

    event DealFunded(address indexed funder, uint256 amount, uint256 totalFunded);
    event PenaltyApplied(uint256 indexed milestoneId, uint256 penaltyAmount, address indexed refundedTo);
    event MilestoneReleased(
        uint256 indexed milestoneId,
        uint256 grossAmount,
        uint256 penaltyAmount,
        uint256 distributedAmount
    );
    event DealClosed(bool success, uint256 payerRefund, uint256 payeeDistribution);

    modifier nonReentrant() {
        require(_locked == 1, "Reentrancy blocked");
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlyPayer() {
        require(msg.sender == payer, "Only payer");
        _;
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter");
        _;
    }

    modifier onlyArbiterOrPayer() {
        require(msg.sender == arbiter || msg.sender == payer, "Only arbiter or payer");
        _;
    }

    constructor(
        address settlementToken_,
        address payer_,
        address arbiter_,
        address[] memory payees_,
        uint16[] memory payeeBps_,
        string[] memory milestoneNames_,
        uint256[] memory milestoneAmounts_,
        uint64[] memory milestoneDueAts_,
        uint256 reserveAmount_,
        uint16 latePenaltyBps_
    ) {
        require(settlementToken_ != address(0), "Invalid token");
        require(payer_ != address(0), "Invalid payer");
        require(arbiter_ != address(0), "Invalid arbiter");
        require(payees_.length != 0 && payees_.length <= 3, "Invalid payee count");
        require(payees_.length == payeeBps_.length, "Payee length mismatch");
        require(
            milestoneNames_.length != 0 &&
                milestoneNames_.length <= 3 &&
                milestoneNames_.length == milestoneAmounts_.length &&
                milestoneAmounts_.length == milestoneDueAts_.length,
            "Milestone length mismatch"
        );
        require(reserveAmount_ != 0, "Reserve required");
        require(latePenaltyBps_ <= 10_000, "Invalid penalty bps");

        settlementToken = IERC20Minimal(settlementToken_);
        payer = payer_;
        arbiter = arbiter_;
        reserveAmount = reserveAmount_;
        latePenaltyBps = latePenaltyBps_;

        uint256 bpsTotal;
        for (uint256 i = 0; i < payees_.length; i++) {
            require(payees_[i] != address(0), "Invalid payee");
            require(payeeBps_[i] != 0, "Zero payee bps");
            _payees.push(payees_[i]);
            _payeeBps.push(payeeBps_[i]);
            bpsTotal += payeeBps_[i];
        }
        require(bpsTotal == 10_000, "Payee bps must sum to 10000");

        uint256 milestoneTotal;
        for (uint256 i = 0; i < milestoneNames_.length; i++) {
            require(bytes(milestoneNames_[i]).length != 0, "Empty milestone name");
            require(milestoneAmounts_[i] != 0, "Zero milestone amount");
            _milestones.push(
                Milestone({
                    name: milestoneNames_[i],
                    amount: milestoneAmounts_[i],
                    dueAt: milestoneDueAts_[i],
                    released: false
                })
            );
            milestoneTotal += milestoneAmounts_[i];
        }

        totalMilestoneAmount = milestoneTotal;
        totalBudget = milestoneTotal + reserveAmount_;
        require(totalBudget != 0, "Zero budget");
    }

    function fund(uint256 amount) external onlyPayer nonReentrant {
        require(!closed, "Deal closed");
        require(amount != 0, "Zero amount");
        require(totalFunded + amount <= totalBudget, "Funding exceeds budget");

        totalFunded += amount;
        _safeTransferFrom(address(settlementToken), msg.sender, address(this), amount);

        emit DealFunded(msg.sender, amount, totalFunded);
    }

    function releaseMilestone(uint256 milestoneId) external onlyArbiter nonReentrant {
        require(!closed, "Deal closed");
        require(milestoneId < _milestones.length, "Invalid milestone");

        Milestone storage milestone = _milestones[milestoneId];
        require(!milestone.released, "Milestone already released");
        require(currentBalance() >= milestone.amount, "Insufficient vault balance");

        milestone.released = true;
        releasedMilestoneCount += 1;

        uint256 penaltyAmount = _calculatePenalty(milestone.amount, milestone.dueAt);
        uint256 distributable = milestone.amount;

        if (penaltyAmount != 0) {
            distributable -= penaltyAmount;
            _safeTransfer(address(settlementToken), payer, penaltyAmount);
            emit PenaltyApplied(milestoneId, penaltyAmount, payer);
        }

        _distribute(distributable);

        emit MilestoneReleased(milestoneId, milestone.amount, penaltyAmount, distributable);
    }

    function closeDeal(bool success) external onlyArbiterOrPayer nonReentrant {
        require(!closed, "Deal already closed");

        if (success) {
            require(msg.sender == arbiter, "Successful close needs arbiter");
            require(allMilestonesReleased(), "All milestones must be released");
            require(totalFunded == totalBudget, "Deal must be fully funded");
        }

        closed = true;

        uint256 balance = currentBalance();
        uint256 payerRefund;
        uint256 payeeDistribution;

        if (balance != 0) {
            if (success) {
                payeeDistribution = balance;
                _distribute(balance);
            } else {
                payerRefund = balance;
                _safeTransfer(address(settlementToken), payer, balance);
            }
        }

        emit DealClosed(success, payerRefund, payeeDistribution);
    }

    function allMilestonesReleased() public view returns (bool) {
        return releasedMilestoneCount == _milestones.length;
    }

    function currentBalance() public view returns (uint256) {
        return settlementToken.balanceOf(address(this));
    }

    function milestoneCount() external view returns (uint256) {
        return _milestones.length;
    }

    function payeeCount() external view returns (uint256) {
        return _payees.length;
    }

    function getMilestone(
        uint256 milestoneId
    ) external view returns (string memory name, uint256 amount, uint64 dueAt, bool released) {
        require(milestoneId < _milestones.length, "Invalid milestone");
        Milestone storage milestone = _milestones[milestoneId];
        return (milestone.name, milestone.amount, milestone.dueAt, milestone.released);
    }

    function getPayee(uint256 payeeId) external view returns (address payee, uint16 bps) {
        require(payeeId < _payees.length, "Invalid payee");
        return (_payees[payeeId], _payeeBps[payeeId]);
    }

    function getSummary()
        external
        view
        returns (
            address token,
            address dealPayer,
            address dealArbiter,
            uint256 budget,
            uint256 funded,
            uint256 balance,
            uint256 milestoneTotal,
            uint256 reserve,
            bool isClosed
        )
    {
        return (
            address(settlementToken),
            payer,
            arbiter,
            totalBudget,
            totalFunded,
            currentBalance(),
            totalMilestoneAmount,
            reserveAmount,
            closed
        );
    }

    function _calculatePenalty(uint256 amount, uint64 dueAt) internal view returns (uint256) {
        if (dueAt == 0 || block.timestamp <= uint256(dueAt) || latePenaltyBps == 0) {
            return 0;
        }

        return (amount * latePenaltyBps) / 10_000;
    }

    function _distribute(uint256 amount) internal {
        if (amount == 0) {
            return;
        }

        uint256 remaining = amount;
        for (uint256 i = 0; i < _payees.length; i++) {
            uint256 payout = i == _payees.length - 1
                ? remaining
                : (amount * _payeeBps[i]) / 10_000;

            remaining -= payout;
            if (payout != 0) {
                _safeTransfer(address(settlementToken), _payees[i], payout);
            }
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferFrom failed");
    }
}
