// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title NAKAStakingContract
 * @dev This contract manages a staking system with three pools of different durations and APYs.
 * The owner can deposit rewards for the stakers. Stakers can deposit and withdraw their tokens
 * to earn rewards.
 */
contract NAKAStakingContract is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- State Variables ---

    // Address of the ERC20 token used for staking and rewards.
    IERC20 public immutable rewardToken;

    // Total amount of tokens staked in the contract.
    uint256 public totalStaked;

    // Struct to define a staking pool.
    struct StakingPool {
        uint256 duration; // in seconds
        uint256 apy; // Annual Percentage Yield (e.g., 100 for 100%)
    }

    // Struct to store a user's individual stake.
    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 poolId;
        bool isWithdrawn; // Flag to check if the stake has been withdrawn
    }

    // Mapping to store the configuration of each staking pool by its ID.
    mapping(uint256 => StakingPool) public stakingPools;

    // Mapping from a user's address to an array of their individual stakes.
    mapping(address => Stake[]) public userStakes;

    // Total rewards deposited into the contract by the owner.
    uint256 public totalRewardsDeposited;

    // Total rewards that have been claimed by users.
    uint256 public totalRewardsDistributed;

    // --- Events ---

    event Staked(address indexed user, uint256 amount, uint256 poolId);
    event Unstaked(address indexed user, uint256 amount, uint256 stakeIndex);
    event RewardsClaimed(
        address indexed user,
        uint256 rewards,
        uint256 stakeIndex
    );
    event RewardsDeposited(address indexed owner, uint256 amount);
    event EmergencyUnstakeWithPenalty(
        address indexed user,
        uint256 originalAmount,
        uint256 withdrawnAmount,
        uint256 penaltyAmount,
        uint256 stakeIndex
    );
    event StakingPoolModified(
        uint256 indexed poolId,
        uint256 oldDuration,
        uint256 newDuration,
        uint256 oldApy,
        uint256 newApy
    );

    // --- Constructor ---

    /**
     * @dev Constructor to initialize the contract with the reward token address
     * and set up the staking pools.
     * @param _rewardTokenAddress The address of the ERC20 token.
     */
    constructor(address _rewardTokenAddress) Ownable(msg.sender) {
        require(_rewardTokenAddress != address(0), "Invalid token address");
        rewardToken = IERC20(_rewardTokenAddress);

        // Initialize the three staking pools
        stakingPools[0] = StakingPool(7 days, 100); // 7 days, 100% APY
        stakingPools[1] = StakingPool(14 days, 150); // 14 days, 150% APY
        stakingPools[2] = StakingPool(21 days, 200); // 21 days, 200% APY
    }

    // --- Owner Functions ---

    /**
     * @dev Allows the owner to deposit more tokens into the contract to be used as rewards.
     * @param _amount The amount of tokens to deposit.
     */
    function depositRewards(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Amount must be greater than zero");
        rewardToken.safeTransferFrom(msg.sender, address(this), _amount);
        totalRewardsDeposited += _amount;
        emit RewardsDeposited(msg.sender, _amount);
    }

    /**
     * @dev Allows the owner to withdraw any excess tokens from the contract.
     * This is useful for removing unspent reward tokens.
     */
    function withdrawLeftoverRewards() external onlyOwner {
        uint256 contractBalance = rewardToken.balanceOf(address(this));
        uint256 leftover = contractBalance -
            (totalStaked + totalRewardsDistributed);
        require(leftover > 0, "No leftover rewards to withdraw");

        rewardToken.safeTransfer(msg.sender, leftover);
    }

    /**
     * @dev Allows the owner to modify the duration and APY of an existing staking pool.
     * @param _poolId The ID of the staking pool to modify.
     * @param _newDuration The new duration in seconds.
     * @param _newApy The new APY value.
     */
    function modifyStakingPool(
        uint256 _poolId,
        uint256 _newDuration,
        uint256 _newApy
    ) external onlyOwner {
        require(stakingPools[_poolId].duration > 0, "Invalid pool ID");
        require(_newDuration > 0, "New duration must be greater than zero");
        require(_newApy > 0, "New APY must be greater than zero");

        uint256 oldDuration = stakingPools[_poolId].duration;
        uint256 oldApy = stakingPools[_poolId].apy;

        stakingPools[_poolId].duration = _newDuration;
        stakingPools[_poolId].apy = _newApy;

        emit StakingPoolModified(
            _poolId,
            oldDuration,
            _newDuration,
            oldApy,
            _newApy
        );
    }

    // --- User Functions ---

    /**
     * @dev Allows a user to stake tokens into a specified pool.
     * @param _amount The amount of tokens to stake.
     * @param _poolId The ID of the staking pool (0, 1, or 2).
     */
    function stake(uint256 _amount, uint256 _poolId) external nonReentrant {
        require(_amount > 0, "Amount must be greater than zero");
        require(stakingPools[_poolId].duration > 0, "Invalid pool ID");

        // The contract must have more tokens than what is currently staked,
        // which implies there are rewards available.
        require(
            rewardToken.balanceOf(address(this)) > totalStaked,
            "Rewards missing. Owner must deposit rewards first."
        );

        // Transfer tokens from the user to the contract.
        rewardToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Record the new stake.
        userStakes[msg.sender].push(
            Stake({
                amount: _amount,
                startTime: block.timestamp,
                poolId: _poolId,
                isWithdrawn: false
            })
        );

        totalStaked += _amount;
        emit Staked(msg.sender, _amount, _poolId);
    }

    /**
     * @dev Allows a user to unstake their tokens and withdraw the principal amount
     * after the staking duration has passed. This does not include rewards.
     * @param _stakeIndex The index of the stake in the userStakes array.
     */
    function unstake(uint256 _stakeIndex) external nonReentrant {
        Stake storage userStake = userStakes[msg.sender][_stakeIndex];

        require(!userStake.isWithdrawn, "Stake already withdrawn");
        require(
            block.timestamp >=
                userStake.startTime + stakingPools[userStake.poolId].duration,
            "Staking period not over yet"
        );

        // Mark the stake as withdrawn before transfer to prevent re-entrancy.
        userStake.isWithdrawn = true;

        // Transfer the original staked amount back to the user.
        rewardToken.safeTransfer(msg.sender, userStake.amount);

        totalStaked -= userStake.amount;
        emit Unstaked(msg.sender, userStake.amount, _stakeIndex);
    }

    /**
     * @dev Allows a user to claim rewards for a specific stake.
     * @param _stakeIndex The index of the stake in the userStakes array.
     */
    function claimRewards(uint256 _stakeIndex) external nonReentrant {
        Stake storage userStake = userStakes[msg.sender][_stakeIndex];

        require(!userStake.isWithdrawn, "Stake already withdrawn");

        // Calculate rewards based on the elapsed time and APY.
        uint256 rewards = _calculateRewards(
            userStake.amount,
            userStake.startTime,
            stakingPools[userStake.poolId].duration,
            stakingPools[userStake.poolId].apy
        );

        require(rewards > 0, "No rewards to claim yet");

        // Check if there are enough rewards in the contract.
        require(
            rewardToken.balanceOf(address(this)) >=
                rewards + (totalStaked - userStake.amount),
            "Rewards are insufficient. Owner needs to refill."
        );

        // Mark the stake as withdrawn before transfer to prevent re-entrancy.
        userStake.isWithdrawn = true;

        // Transfer rewards and the original staked amount back to the user.
        rewardToken.safeTransfer(msg.sender, rewards + userStake.amount);

        totalStaked -= userStake.amount;
        totalRewardsDistributed += rewards;
        emit RewardsClaimed(msg.sender, rewards, _stakeIndex);
    }

    /**
     * @dev Allows a user to unstake their tokens and principal before the staking period ends.
     * This will result in a 2% penalty, which is not returned to the user, and forfeiture of any earned rewards.
     * @param _stakeIndex The index of the stake in the userStakes array.
     */
    function emergencyUnstake(uint256 _stakeIndex) external nonReentrant {
        Stake storage userStake = userStakes[msg.sender][_stakeIndex];

        require(!userStake.isWithdrawn, "Stake already withdrawn");

        // Calculate the 2% penalty.
        uint256 penaltyAmount = (userStake.amount * 2) / 100;
        uint256 amountToWithdraw = userStake.amount - penaltyAmount;

        // Mark the stake as withdrawn, forfeiting any rewards and incurring the penalty.
        userStake.isWithdrawn = true;

        // Transfer the penalized amount back.
        rewardToken.safeTransfer(msg.sender, amountToWithdraw);

        // The full staked amount is removed from the total, the penalty remains in the contract,
        // effectively being added to the reward pool for other stakers.
        totalStaked -= userStake.amount;

        emit EmergencyUnstakeWithPenalty(
            msg.sender,
            userStake.amount,
            amountToWithdraw,
            penaltyAmount,
            _stakeIndex
        );
    }

    // --- View Functions ---

    /**
     * @dev Calculates the potential rewards for a given stake.
     * @param _stakeIndex The index of the stake in the userStakes array.
     * @return The amount of rewards in wei.
     */
    function getPendingRewards(
        uint256 _stakeIndex
    ) public view returns (uint256) {
        Stake memory userStake = userStakes[msg.sender][_stakeIndex];

        if (userStake.isWithdrawn) {
            return 0;
        }

        return
            _calculateRewards(
                userStake.amount,
                userStake.startTime,
                stakingPools[userStake.poolId].duration,
                stakingPools[userStake.poolId].apy
            );
    }

    /**
     * @dev Returns the total number of stakes for the caller.
     * @return The number of stakes.
     */
    function getNumberOfStakes() public view returns (uint256) {
        return userStakes[msg.sender].length;
    }

    /**
     * @dev Returns the total available balance in the contract for rewards.
     * @return The available reward balance.
     */
    function getAvailableRewardsBalance() public view returns (uint256) {
        uint256 contractBalance = rewardToken.balanceOf(address(this));
        if (contractBalance > totalStaked) {
            return contractBalance - totalStaked;
        }
        return 0;
    }

    // --- Internal Helper Functions ---

    /**
     * @dev Internal function to calculate rewards.
     * @param _amount The staked amount.
     * @param _startTime The time the stake was initiated.
     * @param _duration The duration of the staking pool.
     * @param _apy The APY of the staking pool.
     * @return The calculated rewards in wei.
     */
    function _calculateRewards(
        uint256 _amount,
        uint256 _startTime,
        uint256 _duration,
        uint256 _apy
    ) internal pure returns (uint256) {
        uint256 timeElapsed = block.timestamp - _startTime;

        // Rewards are capped at the full duration.
        if (timeElapsed > _duration) {
            timeElapsed = _duration;
        }

        // The APY is divided by 100 to get a percentage.
        // We use 365 days for the denominator to get a daily rate.
        // The amount is multiplied by 1e18 to handle decimal precision.
        uint256 reward = (_amount * _apy * timeElapsed) / (100 * 365 days);
        return reward;
    }
}
