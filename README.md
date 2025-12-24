# Secure Outcome

Secure Outcome is a privacy-preserving prediction dApp built on Zama FHEVM. Users convert ETH to confidential cETH
at a 1:1 rate, create predictions with 2 to 4 options, and place encrypted bets. Bet choices and amounts stay
encrypted on chain, while per-option totals are kept encrypted until the creator closes the prediction and makes the
totals publicly decryptable.

## Overview

Secure Outcome combines confidential tokens with fully homomorphic encryption to enable prediction markets where:
- Users can participate without revealing their choice or stake size during the active phase.
- Aggregated totals remain hidden to prevent signaling or manipulation.
- Final results can be revealed transparently once the prediction closes.

## Problem Statement

Traditional prediction markets expose:
- Individual choices and stake sizes, enabling copy trading or intimidation.
- Real-time totals, which can influence or distort participant behavior.
- On-chain data that cannot be redacted later, permanently revealing user preferences.

## Solution Summary

Secure Outcome keeps sensitive data encrypted using FHE:
- Choices and stakes are encrypted as they enter the chain.
- The contract updates encrypted totals per option without decrypting them.
- The creator can close the prediction, after which totals become publicly decryptable.

## Key Advantages

- Privacy by design: choices and bet amounts are encrypted on chain.
- Fairer signaling: hidden totals reduce strategic manipulation while a market is live.
- Transparent resolution: final totals can be publicly decrypted after closure.
- Simple custody model: users hold cETH and can verify their own bets with FHE permissions.
- Minimal off-chain logic: core logic lives in audited on-chain contracts.

## Core Features

- 1:1 ETH to cETH conversion via confidential minting.
- Prediction creation with 2 to 4 options.
- One encrypted bet per user per prediction.
- Encrypted per-option totals stored on chain.
- Creator-controlled closure with public decrypt of totals.

## How It Works

1. Deposit ETH to mint confidential cETH (1:1).
2. Create a prediction with a title and 2-4 options.
3. Encrypt a choice and bet amount client-side using FHEVM tooling.
4. Transfer cETH with `confidentialTransferAndCall` to place the bet.
5. The contract updates encrypted totals for the chosen option.
6. When the creator closes the prediction, totals are made publicly decryptable.

## Smart Contracts

### ConfidentialETH (`contracts/ConfidentialETH.sol`)

- ERC7984 confidential token named cETH.
- Mints encrypted balances on ETH deposit or direct ETH receive.
- Enforces a maximum amount of `uint64` for encrypted balances.
- Emits `Deposited` events for ETH minting.

Key functions:
- `deposit()` and `receive()` to mint cETH.
- `confidentialTransferAndCall(...)` for encrypted transfers with hooks.

### SecureOutcome (`contracts/SecureOutcome.sol`)

Core state:
- `Prediction` with title, options, option count, creator, open state, and encrypted totals.
- `Bet` with encrypted choice and amount.

Key functions:
- `createPrediction(title, options)` with 2-4 options.
- `getPredictionInfo`, `getPredictionOptions`, `getEncryptedTotals`, `getUserBet`.
- `onConfidentialTransferReceived(...)` to accept encrypted bets.
- `closePrediction(id)` to make totals publicly decryptable.

Security and correctness:
- Only the creator can close a prediction.
- Each account can bet once per prediction.
- Encrypted totals are updated using FHE `select` and `eq`.

## Privacy Model

- Choices and amounts are encrypted as `euint8` and `euint64` using FHEVM.
- The contract never decrypts user inputs; it operates on ciphertexts.
- Each bettor is granted access to their own encrypted choice and amount.
- Totals remain encrypted until the prediction is closed, then become publicly decryptable.
- ETH deposits are public on chain, but cETH transfers and balances are confidential.

## Project Structure

```
contracts/        Solidity contracts (ConfidentialETH, SecureOutcome)
deploy/           Hardhat deploy script
tasks/            Hardhat tasks for addresses, predictions, bets, decryption
test/             Unit tests and Sepolia integration tests
frontend/         React + Vite front-end
deployments/      Network deployment artifacts (including Sepolia ABIs)
```

## Tech Stack

- Solidity 0.8.27
- Zama FHEVM (FHE, encrypted types, FHEVM plugin)
- OpenZeppelin Confidential Contracts (ERC7984)
- Hardhat + hardhat-deploy + typechain
- React + Vite
- RainbowKit + wagmi
- viem for reads, ethers for writes
- npm

## Developer Workflow

### Prerequisites

- Node.js 20+
- npm
- Access to an FHEVM-compatible network (local node and Sepolia)

### Install

```
npm install
```

### Configure (backend only)

Create a `.env` file for Hardhat:
- `INFURA_API_KEY`
- `PRIVATE_KEY`
- `ETHERSCAN_API_KEY` (optional)

Use only PRIVATE_KEY-based accounts.

### Compile

```
npm run compile
```

### Test

```
npm run test
```

The unit tests run on the local Hardhat network with the FHEVM mock. The Sepolia test in
`test/SecureOutcomeSepolia.ts` requires deployed contracts and a live network.

### Deploy

Suggested flow:
1. Start a local node and deploy to it.
2. Run tasks and tests locally.
3. Deploy to Sepolia with a private key.

Local deployment example:
```
npx hardhat deploy --network anvil
```

Sepolia deployment example:
```
npx hardhat deploy --network sepolia
```

### Hardhat Tasks

Available tasks include:
- `task:addresses` print deployed contract addresses.
- `task:create-prediction` create a new prediction.
- `task:place-bet` place an encrypted bet.
- `task:decrypt-totals` decrypt totals after closure.

Example usage:
```
npx hardhat --network sepolia task:addresses
npx hardhat --network sepolia task:create-prediction --title "ETH above 4k" --options "yes,no"
npx hardhat --network sepolia task:place-bet --id 0 --option 1 --amount 1000000000000000000
npx hardhat --network sepolia task:decrypt-totals --id 0
```

## Frontend Integration Notes

- The frontend is in `frontend/` and targets Sepolia.
- Contract ABIs must be copied from `deployments/sepolia` into `frontend/src/config/contracts.ts`.
- Update deployed addresses in `frontend/src/config/contracts.ts`.
- The frontend uses viem for read calls and ethers for write calls.
- Frontend configuration is handled in TypeScript files, without JSON configs or environment variables.

## Data and Event Surface

Events:
- `ConfidentialETH.Deposited(account, amount)` for ETH to cETH minting.
- `SecureOutcome.PredictionCreated(id, creator, title, optionCount)`
- `SecureOutcome.BetPlaced(id, account)`
- `SecureOutcome.PredictionClosed(id, closedBy)`

Observable on chain:
- Prediction metadata (title, options, creator).
- Whether a bet was placed (but not the choice or amount).

Encrypted on chain:
- Individual choices and bet amounts.
- Per-option totals until a prediction is closed.

## Limits and Assumptions

- Encrypted amounts are limited to `uint64`.
- Each account can bet only once per prediction.
- There is no automatic payout or settlement logic in the current contracts.
- The creator controls closing a prediction and releasing totals.

## Future Roadmap

- Add settlement and payout distribution.
- Support multiple bets per account with partial withdrawals.
- Optional outcome or oracle integration for automated closure.
- Add on-chain fee mechanisms for creators or protocol.
- Allow additional collateral types beyond cETH.
- Introduce metadata standards for prediction indexing.
- Improve UI analytics once public totals are available.

## License

BSD-3-Clause-Clear. See `LICENSE`.
