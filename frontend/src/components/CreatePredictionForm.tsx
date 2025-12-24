import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Contract } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { SECURE_OUTCOME_ADDRESS, SECURE_OUTCOME_ABI } from '../config/contracts';
import '../styles/CreatePrediction.css';

type CreatePredictionFormProps = {
  onCreated: () => void;
};

export function CreatePredictionForm({ onCreated }: CreatePredictionFormProps) {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();

  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOptionChange = (index: number, value: string) => {
    setOptions((current) => current.map((option, idx) => (idx === index ? value : option)));
  };

  const addOption = () => {
    setOptions((current) => (current.length < 4 ? [...current, ''] : current));
  };

  const removeOption = (index: number) => {
    setOptions((current) => (current.length > 2 ? current.filter((_, idx) => idx !== index) : current));
  };

  const handleSubmit = async () => {
    if (!address || !signerPromise) {
      setStatus('Connect your wallet to create a prediction.');
      return;
    }

    const trimmedTitle = title.trim();
    const cleanedOptions = options.map((option) => option.trim()).filter((option) => option.length > 0);

    if (!trimmedTitle) {
      setStatus('Provide a title for the prediction.');
      return;
    }

    if (cleanedOptions.length < 2 || cleanedOptions.length > 4) {
      setStatus('Provide 2 to 4 options.');
      return;
    }

    setIsSubmitting(true);
    setStatus('Submitting prediction...');

    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const contract = new Contract(SECURE_OUTCOME_ADDRESS, SECURE_OUTCOME_ABI, signer);
      const tx = await contract.createPrediction(trimmedTitle, cleanedOptions);
      await tx.wait();

      setTitle('');
      setOptions(['', '']);
      setStatus('Prediction created successfully.');
      onCreated();
    } catch (error) {
      console.error(error);
      setStatus('Failed to create prediction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="panel create-panel">
      <div className="panel-header">
        <p className="panel-kicker">Create</p>
        <h2>Launch a prediction</h2>
        <span className="panel-tag">2-4 options</span>
      </div>
      <p className="panel-description">
        Give your prediction a title and define the possible outcomes. You can close it whenever you are ready to
        reveal totals.
      </p>

      <div className="create-form">
        <label className="field-label" htmlFor="prediction-title">Prediction title</label>
        <input
          id="prediction-title"
          type="text"
          placeholder="Will the DAO ship this week?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="field-input"
        />

        <div className="options-header">
          <span className="field-label">Options</span>
          <button type="button" className="link-button" onClick={addOption} disabled={options.length >= 4}>
            + Add option
          </button>
        </div>

        <div className="options-grid">
          {options.map((option, index) => (
            <div key={`option-${index}`} className="option-row">
              <input
                type="text"
                placeholder={`Option ${index + 1}`}
                value={option}
                onChange={(event) => handleOptionChange(index, event.target.value)}
                className="field-input"
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => removeOption(index)}
                disabled={options.length <= 2}
                aria-label="Remove option"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button className="primary-button" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create prediction'}
        </button>
      </div>

      {status && <p className="panel-status">{status}</p>}
    </section>
  );
}
