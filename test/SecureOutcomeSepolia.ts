import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { ConfidentialETH, SecureOutcome } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("SecureOutcomeSepolia", function () {
  let signers: Signers;
  let tokenContract: ConfidentialETH;
  let predictionContract: SecureOutcome;
  let predictionAddress: string;
  let tokenAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const tokenDeployment = await deployments.get("ConfidentialETH");
      const predictionDeployment = await deployments.get("SecureOutcome");

      tokenAddress = tokenDeployment.address;
      predictionAddress = predictionDeployment.address;

      tokenContract = await ethers.getContractAt("ConfidentialETH", tokenAddress);
      predictionContract = await ethers.getContractAt("SecureOutcome", predictionAddress);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("creates a prediction and decrypts public totals", async function () {
    steps = 12;
    this.timeout(4 * 60000);

    progress("Creating prediction...");
    const createTx = await predictionContract
      .connect(signers.alice)
      .createPrediction(`Market ${Date.now()}`, ["Yes", "No"]);
    await createTx.wait();

    const count = await predictionContract.getPredictionCount();
    const predictionId = count - 1n;

    const stake = ethers.parseEther("0.01");

    progress("Minting cETH via deposit...");
    const depositTx = await tokenContract.connect(signers.alice).deposit({ value: stake });
    await depositTx.wait();

    progress("Encrypting bet inputs...");
    const encryptedChoice = await fhevm
      .createEncryptedInput(predictionAddress, tokenAddress)
      .add8(0)
      .encrypt();

    const encryptedAmount = await fhevm
      .createEncryptedInput(tokenAddress, signers.alice.address)
      .add64(stake)
      .encrypt();

    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "bytes32", "bytes"],
      [predictionId, encryptedChoice.handles[0], encryptedChoice.inputProof],
    );

    progress("Placing encrypted bet via cETH transferAndCall...");
    const betTx = await tokenContract
      .connect(signers.alice)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        predictionAddress,
        encryptedAmount.handles[0],
        encryptedAmount.inputProof,
        data,
      );
    await betTx.wait();

    progress("Closing prediction...");
    const closeTx = await predictionContract.connect(signers.alice).closePrediction(predictionId);
    await closeTx.wait();

    progress("Fetching encrypted totals...");
    const [totals, optionCount] = await predictionContract.getEncryptedTotals(predictionId);
    expect(optionCount).to.eq(2);

    progress("Publicly decrypting totals...");
    const totalYes = await fhevm.publicDecryptEuint(FhevmType.euint64, totals[0]);
    const totalNo = await fhevm.publicDecryptEuint(FhevmType.euint64, totals[1]);

    expect(totalYes).to.eq(stake);
    expect(totalNo).to.eq(0n);
  });
});
