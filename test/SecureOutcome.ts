import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { ConfidentialETH, ConfidentialETH__factory, SecureOutcome, SecureOutcome__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const tokenFactory = (await ethers.getContractFactory("ConfidentialETH")) as ConfidentialETH__factory;
  const token = (await tokenFactory.deploy()) as ConfidentialETH;
  const tokenAddress = await token.getAddress();

  const predictionFactory = (await ethers.getContractFactory("SecureOutcome")) as SecureOutcome__factory;
  const prediction = (await predictionFactory.deploy(tokenAddress)) as SecureOutcome;
  const predictionAddress = await prediction.getAddress();

  return { token, tokenAddress, prediction, predictionAddress };
}

describe("SecureOutcome", function () {
  let signers: Signers;
  let token: ConfidentialETH;
  let tokenAddress: string;
  let prediction: SecureOutcome;
  let predictionAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ token, tokenAddress, prediction, predictionAddress } = await deployFixture());
  });

  it("creates a prediction and accepts encrypted bets", async function () {
    const createTx = await prediction
      .connect(signers.deployer)
      .createPrediction("Will ETH close above 4k?", ["Yes", "No"]);
    await createTx.wait();

    const stakeAlice = ethers.parseEther("1");
    const stakeBob = ethers.parseEther("0.5");

    await token.connect(signers.alice).deposit({ value: stakeAlice });
    await token.connect(signers.bob).deposit({ value: stakeBob });

    const encryptedChoiceAlice = await fhevm
      .createEncryptedInput(predictionAddress, tokenAddress)
      .add8(0)
      .encrypt();

    const encryptedAmountAlice = await fhevm
      .createEncryptedInput(tokenAddress, signers.alice.address)
      .add64(stakeAlice)
      .encrypt();

    const dataAlice = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "bytes32", "bytes"],
      [0, encryptedChoiceAlice.handles[0], encryptedChoiceAlice.inputProof],
    );

    const betTxAlice = await token
      .connect(signers.alice)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        predictionAddress,
        encryptedAmountAlice.handles[0],
        encryptedAmountAlice.inputProof,
        dataAlice,
      );
    await betTxAlice.wait();

    const encryptedChoiceBob = await fhevm
      .createEncryptedInput(predictionAddress, tokenAddress)
      .add8(1)
      .encrypt();

    const encryptedAmountBob = await fhevm
      .createEncryptedInput(tokenAddress, signers.bob.address)
      .add64(stakeBob)
      .encrypt();

    const dataBob = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "bytes32", "bytes"],
      [0, encryptedChoiceBob.handles[0], encryptedChoiceBob.inputProof],
    );

    const betTxBob = await token
      .connect(signers.bob)
      ["confidentialTransferAndCall(address,bytes32,bytes,bytes)"](
        predictionAddress,
        encryptedAmountBob.handles[0],
        encryptedAmountBob.inputProof,
        dataBob,
      );
    await betTxBob.wait();

    const [existsAlice, choiceAlice, amountAlice] = await prediction.getUserBet(0, signers.alice.address);
    expect(existsAlice).to.eq(true);

    const decryptedChoiceAlice = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      choiceAlice,
      predictionAddress,
      signers.alice,
    );
    const decryptedAmountAlice = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      amountAlice,
      predictionAddress,
      signers.alice,
    );

    expect(decryptedChoiceAlice).to.eq(0);
    expect(decryptedAmountAlice).to.eq(stakeAlice);

    await prediction.connect(signers.deployer).closePrediction(0);

    const [totals, optionCount] = await prediction.getEncryptedTotals(0);
    expect(optionCount).to.eq(2);

    const totalYes = await fhevm.publicDecryptEuint(FhevmType.euint64, totals[0]);
    const totalNo = await fhevm.publicDecryptEuint(FhevmType.euint64, totals[1]);

    expect(totalYes).to.eq(stakeAlice);
    expect(totalNo).to.eq(stakeBob);
  });
});
