import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { AbiCoder, Contract, formatEther, parseEther } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import {
  CETH_ADDRESS,
  CETH_ABI,
  SECURE_OUTCOME_ADDRESS,
  SECURE_OUTCOME_ABI,
} from '../config/contracts';

const MAX_UINT64 = (1n << 64n) - 1n;

const shorten = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;

const normalizeValue = (value: unknown): bigint => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  return BigInt(value as string);
};

type PredictionCardProps = {
  predictionId: bigint;
  onAction: () => void;
};

export function PredictionCard({ predictionId, onAction }: PredictionCardProps) {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance } = useZamaInstance();

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [status, setStatus] = useState('');
  const [isPlacing, setIsPlacing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isDecryptingBet, setIsDecryptingBet] = useState(false);
  const [isRevealingTotals, setIsRevealingTotals] = useState(false);
  const [betReveal, setBetReveal] = useState<{ option: number; amount: bigint } | null>(null);
  const [totalsReveal, setTotalsReveal] = useState<bigint[] | null>(null);

  const { data: infoData, refetch: refetchInfo } = useReadContract({
    address: SECURE_OUTCOME_ADDRESS,
    abi: SECURE_OUTCOME_ABI,
    functionName: 'getPredictionInfo',
    args: [predictionId],
    query: {
      refetchInterval: 5000,
    },
  });

  const { data: optionsData } = useReadContract({
    address: SECURE_OUTCOME_ADDRESS,
    abi: SECURE_OUTCOME_ABI,
    functionName: 'getPredictionOptions',
    args: [predictionId],
  });

  const { data: totalsData, refetch: refetchTotals } = useReadContract({
    address: SECURE_OUTCOME_ADDRESS,
    abi: SECURE_OUTCOME_ABI,
    functionName: 'getEncryptedTotals',
    args: [predictionId],
  });

  const { data: betData, refetch: refetchBet } = useReadContract({
    address: SECURE_OUTCOME_ADDRESS,
    abi: SECURE_OUTCOME_ABI,
    functionName: 'getUserBet',
    args: address ? [predictionId, address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const info = infoData as readonly [string, boolean, number | bigint, string] | undefined;
  const options = (optionsData as string[] | undefined) ?? [];
  const totals = totalsData as readonly [readonly string[], number | bigint] | undefined;

  const title = info?.[0] ?? 'Loading...';
  const isOpen = info ? info[1] : false;
  const optionCount = info ? Number(info[2]) : options.length;
  const creator = info?.[3];

  const betTuple = betData as readonly [boolean, `0x${string}`, `0x${string}`] | undefined;
  const userBetExists = betTuple?.[0] ?? false;

  const encodedTotals = useMemo(() => {
    if (!totals) {
      return [] as string[];
    }
    const handles = totals[0] as string[];
    return handles.slice(0, optionCount);
  }, [totals, optionCount]);

  const isCreator = !!address && !!creator && address.toLowerCase() === creator.toLowerCase();

  const handlePlaceBet = async () => {
    if (!address || !signerPromise || !instance) {
      setStatus('Connect your wallet to place a bet.');
      return;
    }

    if (selectedOption === null || selectedOption < 0 || selectedOption >= optionCount) {
      setStatus('Select a valid option.');
      return;
    }

    let parsedAmount: bigint;
    try {
      parsedAmount = parseEther(stakeAmount || '0');
    } catch (error) {
      setStatus('Enter a valid cETH amount.');
      return;
    }

    if (parsedAmount <= 0n) {
      setStatus('Stake must be greater than zero.');
      return;
    }

    if (parsedAmount > MAX_UINT64) {
      setStatus('Amount exceeds the cETH limit.');
      return;
    }

    setIsPlacing(true);
    setStatus('Encrypting bet...');

    try {
      const encryptedChoice = await instance
        .createEncryptedInput(SECURE_OUTCOME_ADDRESS, address)
        .add8(BigInt(selectedOption))
        .encrypt();

      const encryptedAmount = await instance
        .createEncryptedInput(CETH_ADDRESS, address)
        .add64(parsedAmount)
        .encrypt();

      const data = AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'bytes'],
        [predictionId, encryptedChoice.handles[0], encryptedChoice.inputProof],
      );

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const token = new Contract(CETH_ADDRESS, CETH_ABI, signer);
      const tx = await token['confidentialTransferAndCall(address,bytes32,bytes,bytes)'](
        SECURE_OUTCOME_ADDRESS,
        encryptedAmount.handles[0],
        encryptedAmount.inputProof,
        data,
      );

      setStatus('Waiting for confirmation...');
      await tx.wait();

      setStatus('Bet placed. Your choice stays encrypted.');
      setStakeAmount('');
      setBetReveal(null);
      await refetchBet();
      await refetchTotals();
      onAction();
    } catch (error) {
      console.error(error);
      setStatus('Bet failed.');
    } finally {
      setIsPlacing(false);
    }
  };

  const handleClosePrediction = async () => {
    if (!signerPromise) {
      setStatus('Connect your wallet to close the prediction.');
      return;
    }

    setIsClosing(true);
    setStatus('Closing prediction...');

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }
      const contract = new Contract(SECURE_OUTCOME_ADDRESS, SECURE_OUTCOME_ABI, signer);
      const tx = await contract.closePrediction(predictionId);
      await tx.wait();
      setStatus('Prediction closed. Totals can be revealed.');
      await refetchInfo();
      await refetchTotals();
      onAction();
    } catch (error) {
      console.error(error);
      setStatus('Closing failed.');
    } finally {
      setIsClosing(false);
    }
  };

  const handleDecryptBet = async () => {
    if (!instance || !address || !signerPromise || !betData) {
      setStatus('Missing bet data.');
      return;
    }

    if (!betTuple || !betTuple[0]) {
      setStatus('No bet found for this wallet.');
      return;
    }

    setIsDecryptingBet(true);
    setStatus('Decrypting your bet...');

    try {
      const keypair = instance.generateKeypair();
      const choiceHandle = betTuple[1];
      const amountHandle = betTuple[2];
      const handleContractPairs = [
        { handle: choiceHandle, contractAddress: SECURE_OUTCOME_ADDRESS },
        { handle: amountHandle, contractAddress: SECURE_OUTCOME_ADDRESS },
      ];

      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [SECURE_OUTCOME_ADDRESS];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
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

      const clearChoice = normalizeValue(result[choiceHandle]);
      const clearAmount = normalizeValue(result[amountHandle]);

      setBetReveal({ option: Number(clearChoice), amount: clearAmount });
      setStatus('Bet decrypted.');
    } catch (error) {
      console.error(error);
      setStatus('Failed to decrypt bet.');
    } finally {
      setIsDecryptingBet(false);
    }
  };

  const handleRevealTotals = async () => {
    if (!instance || encodedTotals.length === 0) {
      setStatus('Totals are not ready yet.');
      return;
    }

    setIsRevealingTotals(true);
    setStatus('Revealing totals...');

    try {
      const result = await instance.publicDecrypt(encodedTotals);
      const values = encodedTotals.map((handle) => normalizeValue(result.clearValues[handle]));
      setTotalsReveal(values);
      setStatus('Totals revealed.');
    } catch (error) {
      console.error(error);
      setStatus('Failed to reveal totals.');
    } finally {
      setIsRevealingTotals(false);
    }
  };

  return (
    <article className={`prediction-card ${isOpen ? 'open' : 'closed'}`}>
      <header>
        <div>
          <p className="prediction-id">Prediction #{predictionId.toString()}</p>
          <h3>{title}</h3>
        </div>
        <span className={`status-pill ${isOpen ? 'status-open' : 'status-closed'}`}>
          {isOpen ? 'Open' : 'Closed'}
        </span>
      </header>

      <div className="prediction-meta">
        <span>Creator: {creator ? shorten(creator) : '...'}</span>
        <span>{optionCount} options</span>
      </div>

      <div className="option-list">
        {options.slice(0, optionCount).map((option, index) => (
          <button
            key={`${predictionId.toString()}-${index}`}
            className={`option-pill ${selectedOption === index ? 'selected' : ''}`}
            onClick={() => setSelectedOption(index)}
            disabled={!isOpen}
            type="button"
          >
            <span>Option {index + 1}</span>
            <strong>{option}</strong>
          </button>
        ))}
      </div>

      {isOpen && (
        <div className="bet-form">
          <label className="field-label">Stake in cETH</label>
          <input
            type="number"
            min="0"
            step="0.001"
            placeholder="0.1"
            value={stakeAmount}
            onChange={(event) => setStakeAmount(event.target.value)}
            className="field-input"
          />
          <button className="primary-button" onClick={handlePlaceBet} disabled={isPlacing}>
            {isPlacing ? 'Submitting...' : 'Place encrypted bet'}
          </button>
        </div>
      )}

      <div className="bet-reveal">
        <div>
          <p className="field-label">Your bet</p>
          {userBetExists ? (
            <p>{betReveal ? `Option ${betReveal.option + 1} · ${formatEther(betReveal.amount)} cETH` : 'Encrypted'}</p>
          ) : (
            <p>No bet from this wallet.</p>
          )}
        </div>
        <button
          className="ghost-button"
          onClick={handleDecryptBet}
          disabled={isDecryptingBet || !userBetExists || !instance || !signerPromise}
        >
          {isDecryptingBet ? 'Decrypting...' : 'Decrypt my bet'}
        </button>
      </div>

      {!isOpen && (
        <div className="totals-block">
          <div>
            <p className="field-label">Totals</p>
            {totalsReveal ? (
              <div className="totals-list">
                {totalsReveal.map((total, index) => (
                  <div key={`${predictionId.toString()}-total-${index}`}>
                    <span>Option {index + 1}</span>
                    <strong>{formatEther(total)} cETH</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p>Totals are encrypted until revealed.</p>
            )}
          </div>
          <button
            className="ghost-button"
            onClick={handleRevealTotals}
            disabled={isRevealingTotals || !instance || totalsReveal !== null}
          >
            {isRevealingTotals ? 'Revealing...' : totalsReveal ? 'Totals revealed' : 'Reveal totals'}
          </button>
        </div>
      )}

      {isCreator && isOpen && (
        <button className="secondary-button" onClick={handleClosePrediction} disabled={isClosing}>
          {isClosing ? 'Closing...' : 'Close prediction'}
        </button>
      )}

      {status && <p className="panel-status">{status}</p>}
    </article>
  );
}
