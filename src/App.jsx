import React, { useState, useEffect } from 'react';
import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react';
import { WagmiConfig, useAccount, useDisconnect, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { mainnet, sepolia, base, baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Wallet, PiggyBank, Handshake, Loader, XCircle, Cat, Gift, LogOut, RefreshCw, Calculator } from 'lucide-react';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import { parseUnits, formatUnits, maxUint256 } from 'viem';

/************************************
 * 🧩 Addresses — REPLACE THESE
 ************************************/
const BENADS_TOKEN_ADDRESS = '0x14381ad86d0acc03f03dec66c39f413047665d4a';
const STAKING_CONTRACT_ADDRESS = '';
const TOKEN_DECIMALS = 18;

/************************************
 * 🔐 Minimal ERC-20 ABI
 ************************************/
const erc20Abi = [
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

/************************************
 * 🏗️ AdvancedBENADSStaking ABI
 ************************************/
const stakingAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: '_amount', type: 'uint256' },
      { internalType: 'uint256', name: '_lockDuration', type: 'uint256' }
    ],
    name: 'stake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: '_lockDuration', type: 'uint256' }],
    name: 'unstake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: '_lockDuration', type: 'uint256' }],
    name: 'emergencyUnstake',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: '_lockDuration', type: 'uint256' }],
    name: 'claimRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'claimAllRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: '_user', type: 'address' },
      { internalType: 'uint256', name: '_lockDuration', type: 'uint256' }
    ],
    name: 'pendingRewards',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'rewardReserve',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalStakedAll',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { internalType: 'address', name: '', type: 'address' },
      { internalType: 'uint256', name: '', type: 'uint256' }
    ],
    name: 'stakes',
    outputs: [
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint64', name: 'startTime', type: 'uint64' },
      { internalType: 'uint64', name: 'lastClaim', type: 'uint64' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getSupportedLockDurations',
    outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  }
];

/************************************
 * 🔌 WalletConnect / wagmi setup
 ************************************/
const projectId = '49c55f91f8d553affc92fdab806e83b6';
const metadata = {
  name: 'BENADS Staking',
  description: 'Stake BENADS, Earn rewards',
  url: '',
  icons: ['https://avatars.githubusercontent.com/u/37784886']
};
const chains = [mainnet, sepolia, base, baseSepolia];
const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata, enableInjected: true, enableEagerConnect: true });
createWeb3Modal({ wagmiConfig, projectId, chains });
const queryClient = new QueryClient();

// SVG bg pattern
const backgroundPattern = '/bg.jpg';

const logoUrl = 'benad.png';
const gifUrl = 'benad.png';

const stakingContract = {
  address: STAKING_CONTRACT_ADDRESS,
  abi: stakingAbi
};

const ApyCalculator = ({ stakingPools, onClose }) => {
  const [amount, setAmount] = useState('');
  const [selectedPool, setSelectedPool] = useState('7-day');
  const [projectedReturns, setProjectedReturns] = useState(null);

  const calculateReturns = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return;

    const pool = stakingPools.find(p => p.id === selectedPool);
    if (!pool) return;

    const apyDecimal = pool.apy / 100;
    const days = parseInt(pool.duration);
    const yearlyReturn = numAmount * apyDecimal;
    const periodReturn = (yearlyReturn * days) / 365;

    setProjectedReturns({
      principal: numAmount,
      reward: periodReturn,
      total: numAmount + periodReturn,
      days: days
    });
  };

  useEffect(() => {
    if (amount) {
      calculateReturns();
    } else {
      setProjectedReturns(null);
    }
  }, [amount, selectedPool]);

  return (
    <div style={{
      backgroundColor: 'rgba(255, 255, 255, 0.7)',
      backdropFilter: 'blur(8px)',
      padding: '1.5rem',
      borderRadius: '1.5rem',
      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
      border: '4px solid #f97316',
      marginBottom: '2rem',
      position: 'relative'
    }}>
      <h2 style={{
        fontSize: '1.5rem',
        fontFamily: '"Burger Free", sans-serif;',
        color: '#1e40af',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center'
      }}>
        <PiggyBank style={{ marginRight: '0.5rem' }} /> APY Calculator
        <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#e5008e' }}>
          <XCircle size={24} />
        </button>
      </h2>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          color: '#e5008e',
          marginBottom: '0.5rem'
        }}>
          Amount to Stake (BENADS)
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount"
          style={{
            width: '100%',
            backgroundColor: 'white',
            color: '#1e40af',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            border: '2px solid #d1d5db',
            fontFamily: '"Burger Free", sans-serif;',
            fontSize: '1.125rem'
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{
          display: 'block',
          fontSize: '0.875rem',
          color: '#e5008e',
          marginBottom: '0.5rem'
        }}>
          Staking Period
        </label>
        <select
          value={selectedPool}
          onChange={(e) => setSelectedPool(e.target.value)}
          style={{
            width: '100%',
            backgroundColor: 'white',
            color: '#1e40af',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            border: '2px solid #d1d5db',
            fontFamily: '"Burger Free", sans-serif;',
            fontSize: '1.125rem'
          }}
        >
          {stakingPools.map(pool => (
            <option key={pool.id} value={pool.id}>
              {pool.duration} ({pool.apy}% APY)
            </option>
          ))}
        </select>
      </div>

      {projectedReturns && (
        <div style={{
          backgroundColor: 'white',
          padding: '1rem',
          borderRadius: '0.75rem',
          border: '2px solid #d1d5db'
        }}>
          <h3 style={{
            fontSize: '1.25rem',
            fontFamily: '"Burger Free", sans-serif;',
            color: '#1e40af',
            marginBottom: '0.5rem'
          }}>
            Projected Returns
          </h3>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ color: '#e5008e' }}>Principal:</span>
            <span style={{ fontFamily: '"Burger Free", sans-serif;' }}>{projectedReturns.principal.toFixed(2)} BENADS</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ color: '#e5008e' }}>Rewards ({projectedReturns.days} days):</span>
            <span style={{ fontFamily: '"Burger Free", sans-serif;', color: '#ab1567' }}>
              +{projectedReturns.reward.toFixed(2)} BENADS
            </span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '0.5rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid #d1d5db'
          }}>
            <span style={{ color: '#e5008e', fontWeight: 'bold' }}>Total:</span>
            <span style={{ fontFamily: '"Burger Free", sans-serif;', fontWeight: 'bold', fontSize: '1.25rem' }}>
              {projectedReturns.total.toFixed(2)} BENADS
            </span>
          </div>
        </div>
      )}

      {!amount && (
        <div style={{
          backgroundColor: '#eff6ff',
          padding: '1rem',
          borderRadius: '0.75rem',
          textAlign: 'center',
          color: '#e5008e'
        }}>
          Enter an amount to calculate your projected returns
        </div>
      )}
    </div>
  );
};

const AppContent = () => {
  const { address, isConnected } = useAccount();
  const { open } = useWeb3Modal();
  const { disconnect } = useDisconnect();
  const { writeContract } = useWriteContract();
  const publicClient = usePublicClient();

  // UI state
  const [stakeInputs, setStakeInputs] = useState({ '7-day': '', '14-day': '', '21-day': '' });
  const [apiQuote, setApiQuote] = useState('Patience is the key to success.');
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState('success');
  const [lastTxHash, setLastTxHash] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [showApyCalculator, setShowApyCalculator] = useState(false); // New state for calculator visibility

  // Staking pools
  const stakingPools = [
    { id: '7-day', duration: '7 Days', apy: 250, lockDurationInSeconds: 7 * 24 * 60 * 60 },
    { id: '14-day', duration: '14 Days', apy: 350, lockDurationInSeconds: 14 * 24 * 60 * 60 },
    { id: '21-day', duration: '21 Days', apy: 500, lockDurationInSeconds: 21 * 24 * 60 * 60 }
  ];

  /***************************
   * 🔎 Reads
   ***************************/
  const { data: tokenBalanceData, refetch: refetchBalance } = useReadContract({
    address: BENADS_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
    query: { enabled: isConnected && !!address }
  });

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: BENADS_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address, STAKING_CONTRACT_ADDRESS],
    query: { enabled: isConnected && !!address }
  });

  const { data: availableRewardsData, refetch: refetchAvailableRewards } = useReadContract({
    ...stakingContract,
    functionName: 'rewardReserve',
    query: { enabled: isConnected }
  });

  const { data: totalStakedData, refetch: refetchTotalStaked } = useReadContract({
    ...stakingContract,
    functionName: 'totalStakedAll',
    query: { enabled: isConnected }
  });

  const { data: staked7, refetch: refetchStaked7 } = useReadContract({
    ...stakingContract,
    functionName: 'stakes',
    args: [address, BigInt(stakingPools[0].lockDurationInSeconds)],
    query: { enabled: isConnected && !!address }
  });
  const { data: staked14, refetch: refetchStaked14 } = useReadContract({
    ...stakingContract,
    functionName: 'stakes',
    args: [address, BigInt(stakingPools[1].lockDurationInSeconds)],
    query: { enabled: isConnected && !!address }
  });
  const { data: staked21, refetch: refetchStaked21 } = useReadContract({
    ...stakingContract,
    functionName: 'stakes',
    args: [address, BigInt(stakingPools[2].lockDurationInSeconds)],
    query: { enabled: isConnected && !!address }
  });

  const { data: rewards7, refetch: refetchRewards7 } = useReadContract({
    ...stakingContract,
    functionName: 'pendingRewards',
    args: [address, BigInt(stakingPools[0].lockDurationInSeconds)],
    query: { enabled: isConnected && !!address }
  });
  const { data: rewards14, refetch: refetchRewards14 } = useReadContract({
    ...stakingContract,
    functionName: 'pendingRewards',
    args: [address, BigInt(stakingPools[1].lockDurationInSeconds)],
    query: { enabled: isConnected && !!address }
  });
  const { data: rewards21, refetch: refetchRewards21 } = useReadContract({
    ...stakingContract,
    functionName: 'pendingRewards',
    args: [address, BigInt(stakingPools[2].lockDurationInSeconds)],
    query: { enabled: isConnected && !!address }
  });

  // tx status
  const { isLoading: isTxPending, isSuccess: isTxSuccess, isError: isTxError } = useWaitForTransactionReceipt({ hash: lastTxHash });

  const showCustomModal = (message, type = 'success') => {
    setModalMessage(message);
    setModalType(type);
    setShowModal(true);
  };

  const refetchAllData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        refetchBalance?.(),
        refetchAllowance?.(),
        refetchAvailableRewards?.(),
        refetchTotalStaked?.(),
        refetchStaked7?.(),
        refetchStaked14?.(),
        refetchStaked21?.(),
        refetchRewards7?.(),
        refetchRewards14?.(),
        refetchRewards21?.(),
      ]);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      showCustomModal('Wallet connected successfully!', 'success');
      refetchAllData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useEffect(() => {
    if (isTxSuccess) {
      showCustomModal('Transaction confirmed ✅', 'success');
      setTimeout(refetchAllData, 2000);
    }
    if (isTxError) {
      showCustomModal('Oh no! Your transaction failed.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTxSuccess, isTxError]);

  useEffect(() => {
    const unsubscribe = wagmiConfig.subscribe((state) => state.status, (status) => {
      if (status === 'connected') {
        refetchAllData();
      }
    });

    return () => unsubscribe();
  }, []);

  /***************************
   * 🧮 Formatting helpers
   ***************************/
  const toNum = (v) => (v === undefined || v === null ? 0 : Number(v));
  const formatAmount = (value, decimals = TOKEN_DECIMALS) => {
    if (value === undefined || value === null) return 0;
    try {
      if (Array.isArray(value)) value = value[0];
      return parseFloat(formatUnits(value, decimals));
    } catch {
      return 0;
    }
  };

  const formattedTokenBalance = formatAmount(tokenBalanceData);
  const formattedStaked7 = formatAmount(staked7);
  const formattedStaked14 = formatAmount(staked14);
  const formattedStaked21 = formatAmount(staked21);
  const formattedRewards7 = formatAmount(rewards7);
  const formattedRewards14 = formatAmount(rewards14);
  const formattedRewards21 = formatAmount(rewards21);
  const formattedAvailableRwds = formatAmount(availableRewardsData);
  const formattedTotalStakedAll = formatAmount(totalStakedData);
  const totalStakedUser = formattedStaked7 + formattedStaked14 + formattedStaked21;
  const totalUserRewards = formattedRewards7 + formattedRewards14 + formattedRewards21;

  const shortAddress = (addr) => `${addr?.substring(0, 6)}...${addr?.substring(addr.length - 4)}`;

  /***************************
   * 🟠 Actions
   ***************************/
  const ensureAllowance = async (requiredAmountWei) => {
    try {
      if (allowanceData === undefined || allowanceData === null) {
        const tx = await writeContract({
          address: BENADS_TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [STAKING_CONTRACT_ADDRESS, maxUint256]
        });
        setLastTxHash(tx);
        return;
      }
      const current = BigInt(allowanceData);
      if (current < requiredAmountWei) {
        const tx = await writeContract({
          address: BENADS_TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [STAKING_CONTRACT_ADDRESS, requiredAmountWei]
        });
        setLastTxHash(tx);
      }
    } catch (error) {
      console.error('Approval failed:', error);
      throw error;
    }
  };

  const handleStake = async (poolId) => {
    const amountStr = stakeInputs[poolId];
    const amountNum = parseFloat(amountStr);
    if (isNaN(amountNum) || amountNum <= 0) {
      showCustomModal('Benad! Please enter a valid amount.', 'error');
      return;
    }

    const pool = stakingPools.find((p) => p.id === poolId);
    if (!pool) return;

    try {
      const amountWei = parseUnits(amountStr, TOKEN_DECIMALS);
      await ensureAllowance(amountWei);
      const tx = await writeContract({
        ...stakingContract,
        functionName: 'stake',
        args: [amountWei, BigInt(pool.lockDurationInSeconds)]
      });
      setLastTxHash(tx);
      showCustomModal('Staking transaction submitted. Waiting for confirmation...', 'success');
      setStakeInputs((prev) => ({ ...prev, [pool.id]: '' }));
    } catch (error) {
      console.error('Stake transaction failed:', error);
      showCustomModal(`Oh no! Staking failed: ${error?.shortMessage || error?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleUnstake = async (poolId) => {
    const pool = stakingPools.find((p) => p.id === poolId);
    if (!pool) return;
    try {
      const tx = await writeContract({
        ...stakingContract,
        functionName: 'unstake',
        args: [BigInt(pool.lockDurationInSeconds)]
      });
      setLastTxHash(tx);
      showCustomModal('Unstaking transaction submitted. Waiting for confirmation...', 'success');
    } catch (error) {
      console.error('Unstake transaction failed:', error);
      showCustomModal(`Oh no! Unstaking failed: ${error?.shortMessage || error?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleEmergencyUnstake = async (poolId) => {
    const pool = stakingPools.find((p) => p.id === poolId);
    if (!pool) return;
    try {
      const tx = await writeContract({
        ...stakingContract,
        functionName: 'emergencyUnstake',
        args: [BigInt(pool.lockDurationInSeconds)]
      });
      setLastTxHash(tx);
      showCustomModal('Emergency unstake submitted. Penalty will apply.', 'success');
    } catch (error) {
      console.error('Emergency unstake failed:', error);
      showCustomModal(`Oh no! Emergency unstake failed: ${error?.shortMessage || error?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleClaimRewards = async (poolId) => {
    const pool = stakingPools.find((p) => p.id === poolId);
    if (!pool) return;
    try {
      const tx = await writeContract({
        ...stakingContract,
        functionName: 'claimRewards',
        args: [BigInt(pool.lockDurationInSeconds)]
      });
      setLastTxHash(tx);
      showCustomModal('Claim transaction submitted. Waiting for confirmation...', 'success');
    } catch (error) {
      console.error('Claim transaction failed:', error);
      showCustomModal(`Oh no! Claiming rewards failed: ${error?.shortMessage || error?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleClaimAllRewards = async () => {
    try {
      const tx = await writeContract({
        ...stakingContract,
        functionName: 'claimAllRewards',
        args: []
      });
      setLastTxHash(tx);
      showCustomModal('Claim all rewards transaction submitted. Waiting for confirmation...', 'success');
    } catch (error) {
      console.error('Claim all rewards transaction failed:', error);
      showCustomModal(`Oh no! Claiming all rewards failed: ${error?.shortMessage || error?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleManualRefresh = async () => {
    await refetchAllData();
    showCustomModal('Data refreshed successfully!', 'success');
  };

  const fetchQuote = async () => {
    setIsLoadingQuote(true);
    try {
      // const text = '';
      setApiQuote(text);
    } finally {
      setIsLoadingQuote(false);
    }
  };

  useEffect(() => { fetchQuote(); }, []);

  return (
    <div className="app-container" style={{ backgroundImage: `url(${backgroundPattern})` }}>
      <style>{`
        @import url('https://fonts.cdnfonts.com/css/burger-free');
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');

        :root {
          --primary-color: #1e40af;
          --secondary-color: #f97316;
          --accent-color: #93c5fd;
          --success-color: #1e40af;
          --danger-color: #1e40af;
          --bg-light: #eff6ff;
          --bg-card: rgba(255, 255, 255, 0.7);
          --border-color: #d1d5db;
        }

        .font-bebas { font-family: "Burger Free", sans-serif;; }
        .font-inter { font-family: "Burger Free", sans-serif;; }
        .text-primary { color: White; }
        .text-secondary { color: var(--secondary-color); }
        .text-success { color: var(--success-color); }
        .text-danger { color: var(--danger-color); }

        .app-container {
  min-height: 100vh;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: var(--bg-light);
  color: var(--primary-color);
  font-family: "Burger Free", sans-serif;
  background-size: cover; /* Add this */
  background-position: center; /* Add this */
  background-repeat: no-repeat; /* Add this */
}
  .main-wrapper { width: 100%; max-width: 64rem; margin-left: auto; margin-right: auto; z-index: 10; position: relative; }

        .header { display: flex; flex-direction: column; justify-content: space-between; align-items: center; background-color: var(--bg-card); backdrop-filter: blur(8px); border-radius: 1.5rem; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); border: 4px solid white; }
        @media (min-width: 640px) { .header { flex-direction: row; } }

        .logo-section { display: flex; align-items: center; justify-content: center; margin-bottom: 1rem; gap: 0.5rem; }
        @media (min-width: 640px) { .logo-section { margin-bottom: 0; } }
        .logo-image { width: 4rem; height: 4rem; border-radius: 9999px; border: 4px solid #fb923c; padding: 0.25rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .text-logo-image { height: 2.5rem; width: auto; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.1)); }
        .app-title { font-size: 1.875rem; font-family: "Burger Free", sans-serif;; color:White); text-shadow: 2px 2px 4px rgba(0,0,0,0.1); letter-spacing: 0.05em; margin-left: 1rem; }

        .connect-button { position: relative; display: inline-flex; height: 3rem; width: 100%; align-items: center; justify-content: center; border-radius: 9999px; padding-left: 1.5rem; padding-right: 1.5rem; font-family: "Burger Free", sans-serif;; color: white; transition: all .3s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); background: linear-gradient(to right, #e633a1ff, #e5008e); }
        .connect-button:hover { transform: scale(1.05); background: linear-gradient(to right, ); }
        @media (min-width: 640px) { .connect-button { width: auto; } }
        .connect-button-content { position: relative; z-index: 10; display: flex; align-items: center; }
        .icon-mr-2 { margin-right: 0.5rem; } .h-5-w-5 { height: 1.25rem; width: 1.25rem; }

        .connected-wallet { display: flex; align-items: center; background-color: white; padding: 0.5rem 1rem; border-radius: 9999px; border: 2px solid var(--success-color); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); color: var(--primary-color); font-weight: 700; }
        .connected-wallet .status-indicator { width: 0.5rem; height: 0.5rem; background-color: var(--success-color); border-radius: 9999px; animation: pulse 1.5s cubic-bezier(0.4,0,0.6,1) infinite; margin-left: 0.5rem; }
        .disconnect-button { padding: 0.25rem; border-radius: 9999px; color: #e5008e; transition: color .3s; margin-left: 0.5rem; }
        .disconnect-button:hover { color: var(--primary-color); }

        .hero-section { display: flex; justify-content: center; margin-bottom: 1.5rem; }
        .hero-cat { width: 12rem; height: 12rem; border-radius: 9999px; border: 4px solid var(--primary-color); background-color: white; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); padding: 1rem; display: flex; align-items: center; justify-content: center; animation: bounce-slow 4s ease-in-out infinite; overflow: hidden; }
        @media (min-width: 640px) { .hero-cat { width: 16rem; height: 16rem; } }
        .hero-cat img { width: 100%; height: 100%; object-fit: cover; border-radius: 9999px; }

        .stats-section { background-color: var(--bg-card); backdrop-filter: blur(8px); padding: 1.5rem; border-radius: 1.5rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); border: 4px solid var(--primary-color); color: var(--primary-color); }
        .stats-section h2 { font-size: 1.5rem; font-family: "Burger Free", sans-serif;; margin-bottom: 1rem; display: flex; align-items: center; }
        .stats-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
        @media (min-width: 640px) { .stats-grid { grid-template-columns: repeat(3, 1fr); } }
        .stat-card { background-color: white; padding: 1rem; border-radius: .75rem; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 2px solid var(--border-color); }
        .stat-card p.label { font-size: 0.875rem; color: #e5008e; }
        .stat-card p.value { font-size: 1.875rem; font-weight: 800; font-family: "Burger Free", sans-serif;; margin-top: 0.25rem; }

        .staking-pools { display: grid; grid-template-columns: 1fr; gap: 1.5rem; }
        @media (min-width: 1024px) { .staking-pools { grid-template-columns: repeat(3, 1fr); } }
        .pool-card { background-color: var(--bg-card); backdrop-filter: blur(8px); padding: 1.5rem; border-radius: 1.5rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); border: 4px solid var(--secondary-color); position: relative; overflow: hidden; color: var(--primary-color); transition: transform .3s; }
        .pool-card:hover { transform: scale(1.05); }
        .pool-card::before { content: ''; position: absolute; inset: 0; background-color: var(--secondary-color); opacity: 0; transition: opacity .3s; z-index: 0; }
        .pool-card:hover::before { opacity: .1; }
        .pool-card h2 { font-size: 1.5rem; font-family: "Burger Free", sans-serif;; color: var(--primary-color); margin-bottom: .5rem; display: flex; align-items: center; position: relative; z-index: 1; }
        .pool-card .apy { font-size: 1.875rem; font-family: "Burger Free", sans-serif;; color: var(--secondary-color); margin-bottom: 1rem; position: relative; z-index: 1; }
        .input-group { position: relative; z-index: 1; }
        .input-group p { font-size: .875rem; color: #e5008e; margin-bottom: .5rem; }
        .input-flex { display: flex; gap: .5rem; }
        .input-field { flex-grow: 1; background-color: white; color: var(--primary-color); padding: .75rem; border-radius: .75rem; border: 2px solid var(--border-color); transition: all .3s; font-family: "Burger Free", sans-serif;; font-size: 1.125rem; }
        .input-field:focus { outline: none; }
        .stake-button { padding: .75rem 1.5rem; border-radius: .75rem; font-family: "Burger Free", sans-serif;; color: white; background-color: var(--primary-color); transition: transform .2s, background-color .2s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); }
        .stake-button:hover { background-color: #1e3a8a; }
        .stake-button:active { transform: scale(0.95); }
        .stake-button:disabled { background-color: #9ca3af; cursor: not-allowed; }
        .unstake-button { padding: .75rem 1.5rem; border-radius: .75rem; font-family: "Burger Free", sans-serif;; color: white; background-color: #e5008e; transition: transform .2s, background-color .2s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); }
        .unstake-button:hover { background-color: #b91c1c; }
        .unstake-button:active { transform: scale(0.95); }
        .unstake-button:disabled { background-color: #9ca3af; cursor: not-allowed; }

        .claim-section { background-color: var(--bg-card); backdrop-filter: blur(8px); padding: 1.5rem; border-radius: 1.5rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); border: 4px solid var(--success-color); margin-top: 1.5rem; color: var(--primary-color); }
        .claim-section h2 { font-size: 1.5rem; font-family: "Burger Free", sans-serif;; color: var(--primary-color); margin-bottom: 1rem; display: flex; align-items: center; }
        .claim-button { width: 100%; display: flex; align-items: center; justify-content: center; padding: .75rem; border-radius: .75rem; font-family: "Burger Free", sans-serif;; font-size: 1.125rem; transition: all .3s; background-color: var(--success-color); color: white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); }
        .claim-button:hover { transform: scale(1.05); box-shadow: 0 10px 15px -3px rgba(0,200,100,0.5); }
        .claim-button:active { transform: scale(1); }
        .claim-button:disabled { background-color: #9ca3af; cursor: not-allowed; transform: none; box-shadow: none; }

        .welcome-message-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; text-align: center; animation: fade-in 1s ease-in-out; color: var(--primary-color); }
        .welcome-title { font-size: 3rem; font-family: "Burger Free", sans-serif;; color: White; margin-bottom: 1rem; text-shadow: 2px 2px 4px rgba(0,0,0,0.1); }
        .welcome-message { color: #10b692ff; margin-bottom: 2rem; max-width: 28rem; }

        .modal-overlay { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background-color: rgba(0,0,0,0.75); }
        .modal-container { position: relative; padding: 1.5rem; border-radius: 1rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); max-width: 24rem; width: 100%; margin: 0 1rem; transform: scale(1); transition: all .2s; text-align: center; }
        .modal-container.success { background-color: var(--success-color); color: white; }
        .modal-container.error { background-color: var(--danger-color); color: white; }
        .modal-close-button { position: absolute; top: .5rem; right: .5rem; color: white; }
        .modal-title { font-size: 1.5rem; font-weight: 700; font-family: "Burger Free", sans-serif;; margin-bottom: .5rem; }
        .modal-text { font-family: "Burger Free", sans-serif;; }

        .footer { margin-top: 2rem; padding-top: 1.5rem; text-align: center; color: #e5008e; border-top: 2px solid var(--primary-color); }
        .quote-text { font-size: .875rem; font-style: italic; }

        .refresh-button { position: fixed; bottom: 2rem; right: 2rem; background-color: var(--primary-color); color: white; width: 3rem; height: 3rem; border-radius: 9999px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); cursor: pointer; transition: all .2s; z-index: 20; }
        .refresh-button:hover { transform: rotate(180deg); background-color: #1e3a8a; }
        .refresh-button:active { transform: rotate(180deg) scale(0.95); }
        .refresh-button.loading { animation: spin 1s linear infinite; }

        .last-updated { font-size: 0.75rem; color: #e5008e; text-align: right; margin-top: 0.5rem; }

        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }s
        @keyframes bounce-slow { 0%,100%{ transform: translateY(-5%) } 50%{ transform: translateY(0) } }
        @keyframes fade-in { 0%{opacity:0} 100%{opacity:1} }
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
      `}</style>

      <div className="main-wrapper">
        {/* Header */}
        <header className="header">
          <div className="logo-section">
            <img src={logoUrl} alt="BENADS LOGO" className="logo-image animate-pulse" />
          </div>

          {isConnected ? (
            <div className="connected-wallet">
              <Wallet className="icon-mr-2" style={{ color: 'var(--success-color)' }} />
              <span className="font-bold hidden-sm">{shortAddress(address)}</span>
              <span className="font-bold visible-sm">Connected</span>
              <div className="status-indicator"></div>
              <button onClick={disconnect} className="disconnect-button"><LogOut size={20} /></button>
            </div>
          ) : (
            <button onClick={() => open()} className="connect-button">
              <span className="connect-button-content"><Wallet className="icon-mr-2 h-5-w-5" />Connect Wallet</span>
            </button>
          )}
        </header>

        {/* Main Dashboard */}
        {isConnected ? (
          <main>
            {/* Hero Cat GIF */}
            <div className="hero-section">
              <div className="hero-cat"><img src={gifUrl} alt="A cute cat GIF" /></div>
            </div>

            {/* APY Calculator */}
            {/* <ApyCalculator stakingPools={stakingPools} /> */}

            {/* Balances & Rewards */}
            <div className="stats-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2><Cat style={{ marginRight: '0.5rem' }} /> Your BENADS Staking Stats</h2>
                {isRefreshing && (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Loader className="animate-spin" style={{ marginRight: '0.5rem' }} />
                    <span>Refreshing...</span>
                  </div>
                )}
              </div>
              <div className="stats-grid">
                <div className="stat-card">
                  <p className="label">Available Balance</p>
                  <p className="value">{formattedTokenBalance.toFixed(2)}</p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', color: '#1e3a8a', marginTop: '0.25rem' }}>BENADS Tokens</p>
                </div>
                <div className="stat-card">
                  <p className="label">Your Total Staked</p>
                  <p className="value">{totalStakedUser.toFixed(2)}</p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', color: '#1e3a8a', marginTop: '0.25rem' }}>BENADS Tokens</p>
                </div>
                <div className="stat-card">
                  <p className="label">Your Total Claimable</p>
                  <p className="value" style={{ color: 'var(--success-color)' }}>{totalUserRewards.toFixed(2)}</p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', color: '#1e3a8a', marginTop: '0.25rem' }}>BENADS Tokens (sum of pools)</p>
                </div>
              </div>

              {/* Contract-level info row */}
              <div className="stats-grid" style={{ marginTop: '1rem' }}>
                <div className="stat-card">
                  <p className="label">Reward Pool (Admin-Funded)</p>
                  <p className="value" title="rewardReserve()">
                    {formattedAvailableRwds.toFixed(2)}
                  </p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', color: '#1e3a8a', marginTop: '0.25rem' }}>
                    BENADS Available for Rewards
                  </p>
                </div>
                <div className="stat-card">
                  <p className="label">Total Staked (All Users)</p>
                  <p className="value">{formattedTotalStakedAll.toFixed(2)}</p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', color: '#1e3a8a', marginTop: '0.25rem' }}>BENADS in contract</p>
                </div>
                <div className="stat-card">
                  <p className="label">Wallet</p>
                  <p className="value" style={{ display: 'flex', gap: '.5rem', alignItems: 'center', justifyContent: 'center' }}>
                    <Wallet /> {shortAddress(address)}
                  </p>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', color: '#1e3a8a', marginTop: '0.25rem' }}>Connected</p>
                </div>
              </div>
              {lastUpdated && (
                <p className="last-updated">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>

            {/* Pools */}
            <div className="staking-pools" style={{ marginTop: '1.5rem' }}>
              {stakingPools.map((pool) => {
                const stakedAmt = pool.id === '7-day' ? formattedStaked7 : pool.id === '14-day' ? formattedStaked14 : formattedStaked21;
                const rewardsAmt = pool.id === '7-day' ? formattedRewards7 : pool.id === '14-day' ? formattedRewards14 : formattedRewards21;
                return (
                  <div key={pool.id} className="pool-card">
                    <h2><Gift style={{ marginRight: '0.5rem' }} /> {pool.duration} Pool</h2>
                    <p className="apy">{pool.apy}% APY</p>

                    <div className="input-group" style={{ marginBottom: '1rem' }}>
                      <p>Your staked amount:</p>
                      <p style={{ fontSize: '1.25rem', fontWeight: 'bold', fontFamily: '"Burger Free", sans-serif;' }}>
                        {stakedAmt.toFixed(2)} BENADS
                      </p>
                    </div>

                    <div className="input-group" style={{ marginBottom: '1rem' }}>
                      <p>Stake BENADS</p>
                      <div className="input-flex">
                        <input
                          type="number"
                          value={stakeInputs[pool.id]}
                          onChange={(e) => setStakeInputs((prev) => ({ ...prev, [pool.id]: e.target.value }))}
                          placeholder="0.0"
                          className="input-field"
                        />
                        <button onClick={() => handleStake(pool.id)} disabled={isTxPending || !stakeInputs[pool.id]} className="stake-button">
                          {isTxPending ? <Loader className="animate-spin" /> : 'Stake'}
                        </button>
                      </div>
                    </div>

                    <div className="input-group" style={{ marginBottom: '1rem' }}>
                      <p>Claimable Rewards:</p>
                      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p style={{ fontSize: '1.25rem', fontWeight: 'bold', fontFamily: '"Burger Free", sans-serif;' }}>
                          {rewardsAmt.toFixed(6)} BENADS
                        </p>
                        <button
                          onClick={() => handleClaimRewards(pool.id)}
                          disabled={isTxPending || rewardsAmt <= 0}
                          className="claim-button"
                          style={{ width: '50%' }}
                        >
                          {isTxPending ? (
                            <Loader className="animate-spin" style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem' }} />
                          ) : (
                            <Handshake style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem' }} />
                          )}
                          {isTxPending ? 'Claiming...' : 'Claim'}
                        </button>
                      </div>
                      <p style={{ fontSize: '.8rem', color: '#1e3a8a', marginTop: '.25rem' }}>
                        Rewards are paid from the admin-funded pool. If it's empty, claims will revert but your stake remains safe.
                      </p>
                    </div>

                    <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                      <p>Unstake All BENADS</p>
                      <div className="input-flex">
                        <button
                          onClick={() => handleUnstake(pool.id)}
                          disabled={isTxPending || stakedAmt <= 0}
                          className="unstake-button"
                          style={{ width: '100%' }}
                        >
                          {isTxPending ? <Loader className="animate-spin" /> : 'Unstake'}
                        </button>
                      </div>
                    </div>

                    <div className="input-group">
                      <p>Emergency Unstake (15% Penalty)</p>
                      <div className="input-flex">
                        <button
                          onClick={() => handleEmergencyUnstake(pool.id)}
                          disabled={isTxPending || stakedAmt <= 0}
                          className="unstake-button"
                          style={{ width: '100%' }}
                        >
                          {isTxPending ? <Loader className="animate-spin" /> : 'Emergency Unstake'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Claim All Rewards Section */}
            <div className="claim-section">
              <h2><PiggyBank style={{ marginRight: '0.5rem' }} /> Claim All Rewards</h2>
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: '"Burger Free", sans-serif;' }}>{totalUserRewards.toFixed(6)} BENADS</p>
                <p style={{ fontSize: '0.875rem', fontFamily: 'Inter, sans-serif', color: '#e5008e' }}>sum across all pools</p>
              </div>
              <button
                onClick={handleClaimAllRewards}
                disabled={isTxPending || totalUserRewards <= 0}
                className="claim-button"
              >
                <Handshake style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem' }} />
                {isTxPending ? 'Claiming All...' : 'Claim All Rewards'}
              </button>
            </div>
          </main>
        ) : (
          <div className="welcome-message-container">
  {/* Main content container with logo on the right */}
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    gap: '6rem', // Increased distance
    width: '100%',
    maxWidth: '1200px', // Increased max width
    margin: '0 auto'
  }}>
    
    {/* Left side - All the content */}
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center',
      flex: 1,
      textAlign: 'center'
    }}>
      <h1 className="welcome-title" style={{ marginBottom: '2rem' }}>
        Welcome to BENADS Staking!
      </h1>
      
      <p className="welcome-message" style={{ marginBottom: '2.5rem', fontSize: '1.3rem' }}>
        Connect your wallet to start staking your BENADS tokens and earn rewards. It's time to put your tokens to work!
      </p>
      
      <button onClick={() => open()} className="connect-button" style={{ marginBottom: '1.5rem', fontSize: '1.2rem', padding: '1rem 2rem' }}>
        <span className="connect-button-content">
          <Wallet className="icon-mr-2 h-5-w-5" />
          Connect Wallet
        </span>
      </button>
      
      <button
        onClick={() => setShowApyCalculator(true)}
        className="connect-button"
        style={{ fontSize: '1.2rem', padding: '1rem 2rem' }}
      >
        <span className="connect-button-content">
          <Calculator className="icon-mr-2 h-5-w-5" />
          Open APY Calculator
        </span>
      </button>

      {/* APY Calculator for non-connected users */}
      {showApyCalculator && (
        <div style={{ width: '100%', maxWidth: '28rem', marginTop: '2rem' }}>
          <ApyCalculator stakingPools={stakingPools} onClose={() => setShowApyCalculator(false)} />
        </div>
      )}
    </div>

    {/* Right side - Larger Logo */}
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexShrink: 0,
      marginLeft: '4rem' // Additional margin for more distance
    }}>
      <img 
        src={logoUrl} 
        alt="BENADS LOGO" 
        style={{ 
          width: '350px', // Much larger logo
          height: '350px', // Much larger logo
          borderRadius: '50%', 
          border: '6px solid #1e40af', // Thicker border
          padding: '0.5rem',
          // animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)'
        }} 
      />
    </div>
  </div>
</div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="modal-overlay">
            <div className={`modal-container ${modalType === 'success' ? 'success' : 'error'}`}>
              <button onClick={() => setShowModal(false)} className="modal-close-button"><XCircle size={24} /></button>
              <div>
                <h3 className="modal-title">{modalType === 'success' ? 'Benad-ificent!' : 'Oh no!'}</h3>
                <p className="modal-text">{modalMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="footer">
          {isLoadingQuote ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Loader className="animate-spin" style={{ width: '1.25rem', height: '1.25rem', marginRight: '0.5rem', color: '#1e3a8a' }} />
              <span className="quote-text">Loading inspiration...</span>
            </div>
          ) : (
            <p className="quote-text">&ldquo;{apiQuote}&rdquo;</p>
          )}
        </footer>

        {/* Refresh Button */}
        {isConnected && (
          <button
            onClick={handleManualRefresh}
            className={`refresh-button ${isRefreshing ? 'loading' : ''}`}
            disabled={isRefreshing}
          >
            <RefreshCw size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

const App = () => (
  <WagmiConfig config={wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  </WagmiConfig>
);

export default App;