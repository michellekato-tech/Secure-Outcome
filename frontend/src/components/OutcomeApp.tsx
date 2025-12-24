import { useState } from 'react';
import { Header } from './Header';
import { SwapPanel } from './SwapPanel';
import { CreatePredictionForm } from './CreatePredictionForm';
import { PredictionList } from './PredictionList';
import '../styles/OutcomeApp.css';

export function OutcomeApp() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((current) => current + 1);
  };

  return (
    <div className="app-shell">
      <div className="ambient-layer" aria-hidden="true">
        <span className="orb orb-one" />
        <span className="orb orb-two" />
        <span className="orb orb-three" />
        <span className="grid-lines" />
      </div>
      <Header />
      <main className="app-main">
        <section className="hero">
          <div className="hero-content">
            <p className="hero-kicker">Encrypted prediction studio</p>
            <h1 className="hero-title">Make outcomes measurable without exposing your choices.</h1>
            <p className="hero-subtitle">
              Convert ETH to cETH, craft prediction markets, and place confidential stakes secured by Zama FHE.
            </p>
            <div className="hero-badges">
              <span>Seamless swap</span>
              <span>Encrypted bets</span>
              <span>Public reveal</span>
            </div>
          </div>
          <div className="hero-panel">
            <div className="hero-panel-title">How it works</div>
            <ul>
              <li>Swap ETH to cETH at a 1:1 rate.</li>
              <li>Create a prediction with 2-4 options.</li>
              <li>Stake cETH and encrypt your choice.</li>
              <li>Close the market to reveal totals.</li>
            </ul>
          </div>
        </section>

        <section className="panel-grid">
          <SwapPanel onComplete={handleRefresh} />
          <CreatePredictionForm onCreated={handleRefresh} />
        </section>

        <PredictionList refreshKey={refreshKey} onAction={handleRefresh} />
      </main>
    </div>
  );
}
