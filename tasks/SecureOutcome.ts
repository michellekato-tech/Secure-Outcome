import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Example:
 *   - npx hardhat --network localhost task:addresses
 *   - npx hardhat --network sepolia task:addresses
 */
task("task:addresses", "Prints the deployed contract addresses").setAction(async function (_args: TaskArguments, hre) {
  const { deployments } = hre;

  const token = await deployments.get("ConfidentialETH");
  const prediction = await deployments.get("SecureOutcome");

  console.log("ConfidentialETH address:", token.address);
  console.log("SecureOutcome address:", prediction.address);
});

/**
 * Example:
 *   - npx hardhat --network localhost task:create-prediction --title "ETH above 4k" --options "yes,no"
 */
task("task:create-prediction", "Creates a new prediction")
  .addParam("title", "Prediction title")
  .addParam("options", "Comma-separated options (2-4)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const predictionDeployment = await deployments.get("SecureOutcome");
    const options = (taskArguments.options as string)
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const [signer] = await ethers.getSigners();
    const predictionContract = await ethers.getContractAt("SecureOutcome", predictionDeployment.address);

    const tx = await predictionContract.connect(signer).createPrediction(taskArguments.title, options);
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:place-bet --id 0 --option 1 --amount 1000000000000000000
 */
task("task:place-bet", "Places an encrypted bet using cETH transferAndCall")
  .addParam("id", "Prediction id")
  .addParam("option", "Option index (0-based)")
  .addParam("amount", "Bet amount in wei")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const predictionDeployment = await deployments.get("SecureOutcome");
    const tokenDeployment = await deployments.get("ConfidentialETH");

    const predictionAddress = predictionDeployment.address;
    const tokenAddress = tokenDeployment.address;

    const predictionId = BigInt(taskArguments.id);
    const optionIndex = Number(taskArguments.option);
    const amount = BigInt(taskArguments.amount);

    await fhevm.initializeCLIApi();

    const [signer] = await ethers.getSigners();

    const encryptedChoice = await fhevm
      .createEncryptedInput(predictionAddress, tokenAddress)
      .add8(optionIndex)
      .encrypt();

    const encryptedAmount = await fhevm
      .createEncryptedInput(tokenAddress, signer.address)
      .add64(amount)
      .encrypt();

    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "bytes32", "bytes"],
      [predictionId, encryptedChoice.handles[0], encryptedChoice.inputProof],
    );

    const tokenContract = await ethers.getContractAt("ConfidentialETH", tokenAddress);

    const tx = await tokenContract
      .connect(signer)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        predictionAddress,
        encryptedAmount.handles[0],
        encryptedAmount.inputProof,
        data,
      );
    console.log(`Wait for tx:${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Example:
 *   - npx hardhat --network localhost task:decrypt-totals --id 0
 */
task("task:decrypt-totals", "Publicly decrypts totals after a prediction is closed")
  .addParam("id", "Prediction id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const predictionDeployment = await deployments.get("SecureOutcome");
    const predictionContract = await ethers.getContractAt("SecureOutcome", predictionDeployment.address);

    const predictionId = BigInt(taskArguments.id);

    await fhevm.initializeCLIApi();

    const [totals, optionCount] = await predictionContract.getEncryptedTotals(predictionId);
    const count = Number(optionCount);

    for (let i = 0; i < count; i += 1) {
      const clearValue = await fhevm.publicDecryptEuint(FhevmType.euint64, totals[i]);
      console.log(`Option ${i} total: ${clearValue.toString()}`);
    }
  });
