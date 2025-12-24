import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract, formatEther, parseEther } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CETH_ADDRESS, CETH_ABI } from '../config/contracts';
import '../styles/SwapPanel.css';

const MAX_UINT64 = (1n << 64n) - 1n;

type SwapPanelProps = {
  onComplete: () => void;
};

export function SwapPanel({ onComplete }: SwapPanelProps) {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance } = useZamaInstance();

  const [ethAmount, setEthAmount] = useState('');
  const [status, setStatus] = useState<string>('');
  const [isSwapping, setIsSwapping] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const { data: encryptedBalance, refetch: refetchBalance } = useReadContract({
    address: CETH_ADDRESS,
    abi: CETH_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const handleSwap = async () => {
    if (!address || !signerPromise) {
      setStatus('Connect your wallet to swap.');
      return;
    }

    let parsedAmount: bigint;
    try {
      parsedAmount = parseEther(ethAmount || '0');
    } catch (error) {
      setStatus('Enter a valid ETH amount.');
      return;
    }

    if (parsedAmount <= 0n) {
      setStatus('Amount must be greater than zero.');
      return;
    }

    if (parsedAmount > MAX_UINT64) {
      setStatus('Amount exceeds the cETH limit.');
      return;
    }

    setIsSwapping(true);
    setStatus('Preparing swap...');

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const token = new Contract(CETH_ADDRESS, CETH_ABI, signer);
      const tx = await token.deposit({ value: parsedAmount });
      setStatus('Waiting for confirmation...');
      await tx.wait();

      setStatus('Swap complete. cETH minted to your wallet.');
      setEthAmount('');
      setBalance(null);
      await refetchBalance();
      onComplete();
    } catch (error) {
      console.error(error);
      setStatus('Swap failed. Please try again.');
    } finally {
      setIsSwapping(false);
    }
  };

  const handleDecryptBalance = async () => {
    if (!instance || !address || !encryptedBalance || !signerPromise) {
      setStatus('Connect your wallet and try again.');
      return;
    }

    if (typeof encryptedBalance === 'string' && BigInt(encryptedBalance) === 0n) {
      setBalance(0n);
      setStatus('Balance is zero.');
      return;
    }

    setIsDecrypting(true);
    setStatus('Decrypting balance...');

    try {
      const keypair = instance.generateKeypair();
      const handle = encryptedBalance as string;

      const handleContractPairs = [
        {
          handle,
          contractAddress: CETH_ADDRESS,
        },
      ];

      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [CETH_ADDRESS];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const signature = await signer.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const clearValue = result[handle];
      const value = typeof clearValue === 'bigint' ? clearValue : BigInt(clearValue);

      setBalance(value);
      setStatus('Balance decrypted.');
    } catch (error) {
      console.error(error);
      setStatus('Decryption failed.');
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <section className="panel swap-panel">
      <div className="panel-header">
        <p className="panel-kicker">Swap</p>
        <h2>ETH to cETH</h2>
        <span className="panel-tag">1:1 rate</span>
      </div>
      <p className="panel-description">
        cETH is the confidential stake token used for encrypted predictions. Mint cETH by depositing ETH.
      </p>

      <div className="swap-form">
        <label className="field-label" htmlFor="swap-amount">Amount (ETH)</label>
        <input
          id="swap-amount"
          type="number"
          min="0"
          step="0.001"
          placeholder="0.25"
          value={ethAmount}
          onChange={(event) => setEthAmount(event.target.value)}
          className="field-input"
        />
        <button className="primary-button" onClick={handleSwap} disabled={isSwapping}>
          {isSwapping ? 'Swapping...' : 'Mint cETH'}
        </button>
      </div>

      <div className="balance-block">
        <div>
          <p className="balance-label">Encrypted cETH balance</p>
          <p className="balance-value">{encryptedBalance ? 'Encrypted handle ready' : 'Connect wallet to view'}</p>
        </div>
        <button
          className="ghost-button"
          onClick={handleDecryptBalance}
          disabled={isDecrypting || !encryptedBalance || !instance || !signerPromise}
        >
          {isDecrypting ? 'Decrypting...' : 'Decrypt balance'}
        </button>
      </div>

      {balance !== null && (
        <div className="balance-reveal">
          <span>Clear balance:</span>
          <strong>{formatEther(balance)} cETH</strong>
        </div>
      )}

      {status && <p className="panel-status">{status}</p>}
    </section>
  );
}
