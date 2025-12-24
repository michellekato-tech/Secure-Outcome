// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, ebool, euint8, euint64, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

import {ConfidentialETH} from "./ConfidentialETH.sol";

contract SecureOutcome is ZamaEthereumConfig, IERC7984Receiver {
    struct Prediction {
        string title;
        string[] options;
        uint8 optionCount;
        bool isOpen;
        address creator;
        euint64[4] totals;
    }

    struct Bet {
        bool exists;
        euint8 choice;
        euint64 amount;
    }

    event PredictionCreated(uint256 indexed predictionId, address indexed creator, string title, uint8 optionCount);
    event BetPlaced(uint256 indexed predictionId, address indexed account);
    event PredictionClosed(uint256 indexed predictionId, address indexed closedBy);

    error PredictionNotFound();
    error PredictionAlreadyClosed();
    error InvalidOptionCount();
    error AlreadyBet();
    error NotCreator();
    error UnauthorizedToken();

    ConfidentialETH public immutable token;

    uint256 private _predictionCount;
    mapping(uint256 => Prediction) private _predictions;
    mapping(uint256 => mapping(address => Bet)) private _bets;

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Token address required");
        token = ConfidentialETH(payable(tokenAddress));
    }

    function getTokenAddress() external view returns (address) {
        return address(token);
    }

    function getPredictionCount() external view returns (uint256) {
        return _predictionCount;
    }

    function getPredictionInfo(
        uint256 predictionId
    ) external view returns (string memory title, bool isOpen, uint8 optionCount, address creator) {
        Prediction storage prediction = _predictions[predictionId];
        if (prediction.creator == address(0)) {
            revert PredictionNotFound();
        }
        return (prediction.title, prediction.isOpen, prediction.optionCount, prediction.creator);
    }

    function getPredictionOptions(uint256 predictionId) external view returns (string[] memory) {
        Prediction storage prediction = _predictions[predictionId];
        if (prediction.creator == address(0)) {
            revert PredictionNotFound();
        }
        return prediction.options;
    }

    function getEncryptedTotals(
        uint256 predictionId
    ) external view returns (euint64[4] memory totals, uint8 optionCount) {
        Prediction storage prediction = _predictions[predictionId];
        if (prediction.creator == address(0)) {
            revert PredictionNotFound();
        }
        return (prediction.totals, prediction.optionCount);
    }

    function getUserBet(
        uint256 predictionId,
        address account
    ) external view returns (bool exists, euint8 choice, euint64 amount) {
        Prediction storage prediction = _predictions[predictionId];
        if (prediction.creator == address(0)) {
            revert PredictionNotFound();
        }
        Bet storage bet = _bets[predictionId][account];
        return (bet.exists, bet.choice, bet.amount);
    }

    function createPrediction(string calldata title, string[] calldata options) external returns (uint256) {
        uint256 optionLength = options.length;
        if (optionLength < 2 || optionLength > 4) {
            revert InvalidOptionCount();
        }

        uint256 predictionId = _predictionCount;
        _predictionCount += 1;

        Prediction storage prediction = _predictions[predictionId];
        prediction.title = title;
        for (uint256 i = 0; i < optionLength; i++) {
            prediction.options.push(options[i]);
        }
        prediction.optionCount = uint8(optionLength);
        prediction.isOpen = true;
        prediction.creator = msg.sender;

        for (uint8 i = 0; i < 4; i++) {
            prediction.totals[i] = FHE.asEuint64(0);
            FHE.allowThis(prediction.totals[i]);
        }

        emit PredictionCreated(predictionId, msg.sender, title, uint8(optionLength));
        return predictionId;
    }

    function closePrediction(uint256 predictionId) external {
        Prediction storage prediction = _predictions[predictionId];
        if (prediction.creator == address(0)) {
            revert PredictionNotFound();
        }
        if (msg.sender != prediction.creator) {
            revert NotCreator();
        }
        if (!prediction.isOpen) {
            revert PredictionAlreadyClosed();
        }

        prediction.isOpen = false;
        for (uint8 i = 0; i < prediction.optionCount; i++) {
            FHE.makePubliclyDecryptable(prediction.totals[i]);
        }

        emit PredictionClosed(predictionId, msg.sender);
    }

    function onConfidentialTransferReceived(
        address,
        address from,
        euint64 amount,
        bytes calldata data
    ) external returns (ebool) {
        if (msg.sender != address(token)) {
            revert UnauthorizedToken();
        }

        (uint256 predictionId, bytes32 choiceHandle, bytes memory inputProof) = abi.decode(
            data,
            (uint256, bytes32, bytes)
        );

        _placeBet(predictionId, from, amount, choiceHandle, inputProof);
        emit BetPlaced(predictionId, from);

        ebool accepted = FHE.asEbool(true);
        FHE.allowTransient(accepted, msg.sender);
        return accepted;
    }

    function _placeBet(
        uint256 predictionId,
        address account,
        euint64 amount,
        bytes32 choiceHandle,
        bytes memory inputProof
    ) internal {
        Prediction storage prediction = _predictions[predictionId];
        if (prediction.creator == address(0)) {
            revert PredictionNotFound();
        }
        if (!prediction.isOpen) {
            revert PredictionAlreadyClosed();
        }

        Bet storage bet = _bets[predictionId][account];
        if (bet.exists) {
            revert AlreadyBet();
        }

        euint8 choice = FHE.fromExternal(externalEuint8.wrap(choiceHandle), inputProof);

        _updateTotals(prediction, choice, amount);

        bet.exists = true;
        bet.choice = choice;
        bet.amount = amount;

        FHE.allowThis(choice);
        FHE.allowThis(amount);
        FHE.allow(choice, account);
        FHE.allow(amount, account);
    }

    function _updateTotals(Prediction storage prediction, euint8 choice, euint64 amount) internal {
        for (uint8 i = 0; i < prediction.optionCount; i++) {
            ebool matches = FHE.eq(choice, FHE.asEuint8(i));
            euint64 updated = FHE.select(matches, FHE.add(prediction.totals[i], amount), prediction.totals[i]);
            prediction.totals[i] = updated;
            FHE.allowThis(updated);
        }
    }
}
