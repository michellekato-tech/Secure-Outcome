import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { SECURE_OUTCOME_ADDRESS, SECURE_OUTCOME_ABI } from '../config/contracts';
import { PredictionCard } from './PredictionCard';
import '../styles/PredictionCard.css';

type PredictionListProps = {
  refreshKey: number;
  onAction: () => void;
};

export function PredictionList({ refreshKey, onAction }: PredictionListProps) {
  const { data: countData, isLoading } = useReadContract({
    address: SECURE_OUTCOME_ADDRESS,
    abi: SECURE_OUTCOME_ABI,
    functionName: 'getPredictionCount',
    query: {
      refetchInterval: 5000,
    },
  });

  const count = Number(countData ?? 0);

  const predictionIds = useMemo(() => {
    return Array.from({ length: count }, (_, index) => BigInt(index));
  }, [count, refreshKey]);

  return (
    <section className="prediction-section">
      <div className="prediction-header">
        <div>
          <p className="panel-kicker">Markets</p>
          <h2>Live predictions</h2>
        </div>
        <span className="panel-tag">{count} total</span>
      </div>

      {isLoading && <p className="panel-status">Loading predictions...</p>}

      {!isLoading && count === 0 && (
        <div className="empty-state">
          <p>No predictions yet. Create the first one to get started.</p>
        </div>
      )}

      <div className="prediction-grid">
        {predictionIds.map((predictionId) => (
          <PredictionCard key={`${predictionId.toString()}-${refreshKey}`} predictionId={predictionId} onAction={onAction} />
        ))}
      </div>
    </section>
  );
}
