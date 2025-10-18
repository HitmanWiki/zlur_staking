// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AdvancedNakaStaking
 * @notice Staking of NAKA (or any ERC20) with multiple lock-duration pools.
 * - Admin funds rewards by depositing the same token as staked.
 * - Rewards are paid from the contract's balance (reward reserve).
 * - If reward reserve is empty or insufficient, users can still withdraw principal.
 * - Unstake (after lock): pays pending rewards up to available reserve, then always returns principal.
 * - Emergency unstake (before lock): 2% penalty, forfeits rewards; penalty stays in contract as extra rewards.
 *
 * APY model:
 *   reward = amount * APY(%) * elapsed / (100 * 365 days)
 *
 * Notes:
 * - One stake per user per pool (by lock duration). Topping-up is supported (it auto-claims first).
 * - Admin can add/modify pools.
 */
contract AdvancedNakaStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --------------------------------------------------------------------------------
    // State
    // --------------------------------------------------------------------------------

    IERC20 public immutable token; // staking & reward token are the same

    // lockDuration (seconds) => Pool
    struct Pool {
        uint256 apy; // e.g. 100 = 100% APY
        bool exists;
        uint256 totalStaked; // total principal currently staked in this pool
    }

    // user => lockDuration => stake
    struct StakeInfo {
        uint256 amount; // principal
        uint64 startTime; // when stake was first created (for reference)
        uint64 lastClaim; // last time rewards were claimed/updated
    }

    mapping(uint256 => Pool) public pools;
    uint256[] public supportedLockDurations;

    mapping(address => mapping(uint256 => StakeInfo)) public stakes;

    // 2% emergency-unstake penalty (in basis points of principal)
    uint256 public constant EMERGENCY_UNSTAKE_PENALTY_BPS = 200; // 200 bps = 2%
    uint256 private constant SECONDS_PER_YEAR = 365 days;

    // --------------------------------------------------------------------------------
    // Events
    // --------------------------------------------------------------------------------
    event PoolAdded(uint256 indexed lockDuration, uint256 apy);
    event PoolModified(uint256 indexed lockDuration, uint256 apy);
    event RewardsDeposited(address indexed from, uint256 amount);

    event Staked(
        address indexed user,
        uint256 amount,
        uint256 indexed lockDuration,
        uint256 timestamp
    );
    event ToppedUp(
        address indexed user,
        uint256 addedAmount,
        uint256 indexed lockDuration,
        uint256 timestamp
    );
    event RewardsClaimed(
        address indexed user,
        uint256 rewards,
        uint256 timestamp
    );
    event Unstaked(
        address indexed user,
        uint256 amount,
        uint256 rewardsPaid,
        uint256 indexed lockDuration,
        uint256 timestamp
    );
    event EmergencyUnstaked(
        address indexed user,
        uint256 returnedAmount,
        uint256 penalty,
        uint256 indexed lockDuration,
        uint256 timestamp
    );

    // --------------------------------------------------------------------------------
    // Constructor
    // --------------------------------------------------------------------------------

    /**
     * @param _token ERC20 token address (staked token == reward token)
     * @param _owner contract owner address
     * @param _durations array of initial lock durations in seconds
     * @param _apys array of initial APYs (same length as _durations), e.g., 100 = 100%
     */
    constructor(
        IERC20 _token,
        address _owner,
        uint256[] memory _durations,
        uint256[] memory _apys
    ) Ownable(_owner) {
        require(address(_token) != address(0), "Token=0");
        require(_durations.length == _apys.length, "Array length mismatch");
        token = _token;

        for (uint256 i = 0; i < _durations.length; i++) {
            _addPool(_durations[i], _apys[i]);
        }
    }

    // --------------------------------------------------------------------------------
    // Admin
    // --------------------------------------------------------------------------------

    function addStakingPool(
        uint256 _lockDuration,
        uint256 _apy
    ) external onlyOwner {
        _addPool(_lockDuration, _apy);
    }

    function modifyStakingPool(
        uint256 _lockDuration,
        uint256 _newApy
    ) external onlyOwner {
        require(pools[_lockDuration].exists, "Pool missing");
        require(_newApy > 0, "APY=0");
        pools[_lockDuration].apy = _newApy;
        emit PoolModified(_lockDuration, _newApy);
    }

    /**
     * @notice Deposit reward tokens. These tokens form the reward reserve.
     */
    function depositRewards(uint256 _amount) external onlyOwner nonReentrant {
        require(_amount > 0, "Amount=0");
        token.safeTransferFrom(msg.sender, address(this), _amount);
        emit RewardsDeposited(msg.sender, _amount);
    }

    // --------------------------------------------------------------------------------
    // User actions
    // --------------------------------------------------------------------------------

    /**
     * @notice Stake tokens into a pool (by lock duration).
     * @dev Staking is allowed even if reward reserve is empty.
     */
    /**
     * @notice Stake tokens into a pool (by lock duration).
     * @dev Staking is allowed even if reward reserve is empty.
     */
    function stake(
        uint256 _amount,
        uint256 _lockDuration
    ) external nonReentrant {
        require(_amount > 0, "Amount=0");
        Pool storage p = pools[_lockDuration];
        require(p.exists, "Invalid pool");

        StakeInfo storage s = stakes[msg.sender][_lockDuration];

        // If already staked in this pool, auto-claim pending (capped by reserve) before adding
        if (s.amount > 0) {
            // Remove the unused variable and just call the function
            _claimInternal(msg.sender, _lockDuration);

            p.totalStaked += _amount;
            s.amount += _amount;
            // restart accrual from now
            s.lastClaim = uint64(block.timestamp);
            token.safeTransferFrom(msg.sender, address(this), _amount);
            emit ToppedUp(msg.sender, _amount, _lockDuration, block.timestamp);
        } else {
            // first time in this pool
            p.totalStaked += _amount;
            s.amount = _amount;
            s.startTime = uint64(block.timestamp);
            s.lastClaim = uint64(block.timestamp);
            token.safeTransferFrom(msg.sender, address(this), _amount);
            emit Staked(msg.sender, _amount, _lockDuration, block.timestamp);
        }
    }

    /**
     * @notice Unstake after lock expires. Tries to pay pending rewards up to available reserve,
     *         then ALWAYS returns principal.
     */
    function unstake(uint256 _lockDuration) external nonReentrant {
        Pool storage p = pools[_lockDuration];
        require(p.exists, "Invalid pool");

        StakeInfo storage s = stakes[msg.sender][_lockDuration];
        uint256 amount = s.amount;
        require(amount > 0, "Nothing staked");
        require(
            block.timestamp >= uint256(s.startTime) + _lockDuration,
            "Locked"
        );

        // Try to claim pending rewards (capped by available reserve)
        uint256 rewardsPaid = _claimInternal(msg.sender, _lockDuration);

        // Return principal
        p.totalStaked -= amount;
        s.amount = 0;
        s.lastClaim = 0;
        s.startTime = 0;

        token.safeTransfer(msg.sender, amount);

        emit Unstaked(
            msg.sender,
            amount,
            rewardsPaid,
            _lockDuration,
            block.timestamp
        );
    }

    /**
     * @notice Emergency unstake before lock expires.
     * @dev Forfeits all rewards. Deducts 2% penalty that stays in contract as extra rewards.
     */
    function emergencyUnstake(uint256 _lockDuration) external nonReentrant {
        Pool storage p = pools[_lockDuration];
        require(p.exists, "Invalid pool");

        StakeInfo storage s = stakes[msg.sender][_lockDuration];
        uint256 amount = s.amount;
        require(amount > 0, "Nothing staked");

        // Compute penalty, user forfeits all rewards (no claim)
        uint256 penalty = (amount * EMERGENCY_UNSTAKE_PENALTY_BPS) / 10_000;
        uint256 toReturn = amount - penalty;

        p.totalStaked -= amount;
        s.amount = 0;
        s.lastClaim = 0;
        s.startTime = 0;

        // penalty remains in the contract (becomes part of reward reserve)
        token.safeTransfer(msg.sender, toReturn);

        emit EmergencyUnstaked(
            msg.sender,
            toReturn,
            penalty,
            _lockDuration,
            block.timestamp
        );
    }

    /**
     * @notice Claim rewards across all pools (capped by available reserve).
     */
    function claimAllRewards() external nonReentrant {
        uint256 totalPaid = 0;

        for (uint256 i = 0; i < supportedLockDurations.length; i++) {
            uint256 ld = supportedLockDurations[i];
            StakeInfo storage s = stakes[msg.sender][ld];
            if (s.amount == 0) continue;
            totalPaid += _claimInternal(msg.sender, ld);
        }

        require(totalPaid > 0, "No rewards");
        emit RewardsClaimed(msg.sender, totalPaid, block.timestamp);
    }

    /**
     * @notice Claim rewards for a specific pool (capped by available reserve).
     */
    function claimRewards(uint256 _lockDuration) external nonReentrant {
        uint256 paid = _claimInternal(msg.sender, _lockDuration);
        require(paid > 0, "No rewards");
        emit RewardsClaimed(msg.sender, paid, block.timestamp);
    }

    // --------------------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------------------

    function getRewards(address _user) external view returns (uint256 total) {
        for (uint256 i = 0; i < supportedLockDurations.length; i++) {
            total += pendingRewards(_user, supportedLockDurations[i]);
        }
    }

    function pendingRewards(
        address _user,
        uint256 _lockDuration
    ) public view returns (uint256) {
        Pool storage p = pools[_lockDuration];
        if (!p.exists) return 0;

        StakeInfo storage s = stakes[_user][_lockDuration];
        if (s.amount == 0) return 0;

        uint256 elapsed = block.timestamp - uint256(s.lastClaim);
        if (elapsed == 0) return 0;

        // reward = amount * APY(%) * elapsed / (100 * year)
        return (s.amount * p.apy * elapsed) / (100 * SECONDS_PER_YEAR);
    }

    /**
     * @notice Available reward reserve = contract balance - total staked across all pools.
     */
    function rewardReserve() public view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        return bal - totalStakedAll();
    }

    function totalStakedAll() public view returns (uint256 total) {
        for (uint256 i = 0; i < supportedLockDurations.length; i++) {
            total += pools[supportedLockDurations[i]].totalStaked;
        }
    }

    function getSupportedLockDurations()
        external
        view
        returns (uint256[] memory)
    {
        return supportedLockDurations;
    }

    // --------------------------------------------------------------------------------
    // Internal helpers
    // --------------------------------------------------------------------------------

    function _addPool(uint256 _lockDuration, uint256 _apy) internal {
        require(_lockDuration > 0, "Lock=0");
        require(_apy > 0, "APY=0");
        require(!pools[_lockDuration].exists, "Exists");

        pools[_lockDuration] = Pool({apy: _apy, exists: true, totalStaked: 0});
        supportedLockDurations.push(_lockDuration);
        emit PoolAdded(_lockDuration, _apy);
    }

    /**
     * @dev Claims rewards for a (user, pool) pair, capping by current reward reserve.
     *      Updates lastClaim. Returns the amount actually paid.
     */
    function _claimInternal(
        address _user,
        uint256 _lockDuration
    ) internal returns (uint256 paid) {
        Pool storage p = pools[_lockDuration];
        require(p.exists, "Invalid pool");
        StakeInfo storage s = stakes[_user][_lockDuration];
        if (s.amount == 0) return 0;

        uint256 pending = pendingRewards(_user, _lockDuration);
        if (pending == 0) {
            // still update lastClaim to avoid accumulation quirks if caller expects refresh
            s.lastClaim = uint64(block.timestamp);
            return 0;
        }

        uint256 reserve = rewardReserve();
        if (reserve == 0) {
            // no rewards available; just update lastClaim (explicit behavior)
            s.lastClaim = uint64(block.timestamp);
            return 0;
        }

        paid = pending > reserve ? reserve : pending;

        // effects
        s.lastClaim = uint64(block.timestamp);

        // interactions
        token.safeTransfer(_user, paid);
    }
}
