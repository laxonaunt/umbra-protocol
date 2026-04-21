// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title UmbraVault
 * @notice Core vault contract for confidential DeFi lending on Arbitrum Sepolia.
 * @author ChainGPT (base) + Umbra Protocol (interface + health factor fixes)
 * @dev Users deposit ETH as collateral and borrow USDC. Collateralization enforced via UmbraOracle.
 *      Interest accrues per second. Owner manages USDC reserve.
 */

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Interface matching the actual UmbraOracle deployment
interface IUmbraOracle {
    function getHealthFactor(
        uint256 collateralAmountETH,
        uint256 debtAmountUSDC
    ) external view returns (uint256 healthFactor);
}

contract UmbraVault is Ownable, ReentrancyGuard {

    // ========== CONSTANTS ==========

    uint256 public constant ANNUAL_INTEREST_BPS = 500;   // 5% per year
    uint256 public constant BPS_DENOMINATOR      = 10000;
    uint256 public constant SECONDS_PER_YEAR     = 365 days;
    uint256 public constant LIQUIDATION_THRESHOLD = 100; // health factor below this = liquidatable

    // ========== STRUCTS ==========

    /// @notice Stores all data for a single user lending position
    struct Position {
        uint256 collateralAmountETH;
        uint256 debtAmountUSDC;
        uint256 lastInterestUpdate;
        bool    isLiquidatable;
    }

    // ========== STATE ==========

    mapping(address => Position) private positions;

    IUmbraOracle public immutable oracle;
    IERC20       public immutable usdc;
    uint256      public usdcReserve;

    // ========== EVENTS ==========

    event CollateralDeposited(address indexed user, uint256 amountETH);
    event CollateralWithdrawn(address indexed user, uint256 amountETH);
    event Borrowed(address indexed user, uint256 amountUSDC);
    event Repaid(address indexed user, uint256 amountUSDC);
    event ReserveFunded(address indexed owner, uint256 amountUSDC);
    event LiquidationFlagged(address indexed user);

    // ========== ERRORS ==========

    error InsufficientCollateral();
    error PositionUnhealthy();
    error InsufficientReserve();
    error ZeroAmount();
    error NotLiquidatable();
    error NotPositionHolder();

    // ========== MODIFIERS ==========

    modifier onlyPositionHolder(address user) {
        if (msg.sender != user && msg.sender != owner()) revert NotPositionHolder();
        _;
    }

    modifier accrue(address user) {
        accrueInterest(user);
        _;
    }

    // ========== CONSTRUCTOR ==========

    constructor(address _oracle, address _usdc) Ownable(msg.sender) {
        require(_oracle != address(0), "Zero oracle address");
        require(_usdc   != address(0), "Zero USDC address");
        oracle = IUmbraOracle(_oracle);
        usdc   = IERC20(_usdc);
    }

    // ========== DEPOSIT & WITHDRAW ==========

    /// @notice Deposit ETH as collateral
    function depositCollateral()
        external
        payable
        nonReentrant
        accrue(msg.sender)
    {
        if (msg.value == 0) revert ZeroAmount();
        positions[msg.sender].collateralAmountETH += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    /// @notice Withdraw ETH collateral — position must remain healthy after
    /// @param amount Amount of ETH to withdraw in wei
    function withdrawCollateral(uint256 amount)
        external
        nonReentrant
        accrue(msg.sender)
    {
        if (amount == 0) revert ZeroAmount();
        Position storage pos = positions[msg.sender];
        if (amount > pos.collateralAmountETH) revert InsufficientCollateral();

        pos.collateralAmountETH -= amount;

        uint256 hf = oracle.getHealthFactor(
            pos.collateralAmountETH,
            pos.debtAmountUSDC
        );
        if (hf < LIQUIDATION_THRESHOLD) {
            pos.collateralAmountETH += amount; // restore state before revert
            revert PositionUnhealthy();
        }

        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit CollateralWithdrawn(msg.sender, amount);
    }

    // ========== BORROW & REPAY ==========

    /// @notice Borrow USDC against ETH collateral
    /// @param amount Amount of USDC to borrow (6 decimals)
    function borrow(uint256 amount)
        external
        nonReentrant
        accrue(msg.sender)
    {
        if (amount == 0) revert ZeroAmount();
        Position storage pos = positions[msg.sender];

        if (amount > usdcReserve) revert InsufficientReserve();

        uint256 newDebt = pos.debtAmountUSDC + amount;
        uint256 hf = oracle.getHealthFactor(pos.collateralAmountETH, newDebt);
        if (hf < LIQUIDATION_THRESHOLD) revert PositionUnhealthy();

        pos.debtAmountUSDC = newDebt;
        usdcReserve -= amount;

        require(usdc.transfer(msg.sender, amount), "USDC transfer failed");
        emit Borrowed(msg.sender, amount);
    }

    /// @notice Repay USDC debt
    /// @param amount Amount of USDC to repay
    function repay(uint256 amount)
        external
        nonReentrant
        accrue(msg.sender)
    {
        if (amount == 0) revert ZeroAmount();
        Position storage pos = positions[msg.sender];

        uint256 repayAmount = amount > pos.debtAmountUSDC
            ? pos.debtAmountUSDC
            : amount;

        require(
            usdc.transferFrom(msg.sender, address(this), repayAmount),
            "USDC transferFrom failed"
        );

        pos.debtAmountUSDC -= repayAmount;
        usdcReserve        += repayAmount;

        emit Repaid(msg.sender, repayAmount);
    }

    // ========== INTEREST ==========

    /// @notice Accrues per-second interest on a user's debt
    /// @param user Address of the user
    function accrueInterest(address user) public {
        Position storage pos = positions[user];
        uint256 nowTime = block.timestamp;

        if (pos.lastInterestUpdate == 0) {
            pos.lastInterestUpdate = nowTime;
            return;
        }
        if (pos.debtAmountUSDC == 0) {
            pos.lastInterestUpdate = nowTime;
            return;
        }

        uint256 elapsed  = nowTime - pos.lastInterestUpdate;
        uint256 interest = (pos.debtAmountUSDC * ANNUAL_INTEREST_BPS * elapsed)
                           / (SECONDS_PER_YEAR * BPS_DENOMINATOR);

        pos.debtAmountUSDC     += interest;
        pos.lastInterestUpdate  = nowTime;
    }

    // ========== LIQUIDATION ==========

    /// @notice Flag a position for liquidation if health factor < 100
    /// @param user Address of the user to flag
    function flagForLiquidation(address user) external accrue(user) {
        Position storage pos = positions[user];
        uint256 hf = oracle.getHealthFactor(
            pos.collateralAmountETH,
            pos.debtAmountUSDC
        );
        if (hf >= LIQUIDATION_THRESHOLD) revert NotLiquidatable();
        if (!pos.isLiquidatable) {
            pos.isLiquidatable = true;
            emit LiquidationFlagged(user);
        }
    }

    // ========== RESERVE ==========

    /// @notice Owner funds the USDC lending reserve
    /// @param amount Amount of USDC to deposit into the reserve
    function fundReserve(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        require(
            usdc.transferFrom(msg.sender, address(this), amount),
            "USDC transferFrom failed"
        );
        usdcReserve += amount;
        emit ReserveFunded(msg.sender, amount);
    }

    // ========== VIEW ==========

    /// @notice Returns a user's position — only callable by the user or owner
    /// @param user Address of the user
    function getPosition(address user)
        external
        view
        onlyPositionHolder(user)
        returns (
            uint256 collateralAmountETH,
            uint256 debtAmountUSDC,
            uint256 lastInterestUpdate,
            bool    isLiquidatable
        )
    {
        Position storage pos = positions[user];
        return (
            pos.collateralAmountETH,
            pos.debtAmountUSDC,
            pos.lastInterestUpdate,
            pos.isLiquidatable
        );
    }

   receive() external payable {}

/// @dev Reject direct ETH sends that don't go through depositCollateral
fallback() external payable {
    revert("Use depositCollateral()");
}
}