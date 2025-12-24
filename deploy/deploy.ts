import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedToken = await deploy("ConfidentialETH", {
    from: deployer,
    log: true,
  });

  const deployedPrediction = await deploy("SecureOutcome", {
    from: deployer,
    log: true,
    args: [deployedToken.address],
  });

  console.log(`ConfidentialETH contract: `, deployedToken.address);
  console.log(`SecureOutcome contract: `, deployedPrediction.address);
};
export default func;
func.id = "deploy_secureOutcome"; // id required to prevent reexecution
func.tags = ["SecureOutcome"];
