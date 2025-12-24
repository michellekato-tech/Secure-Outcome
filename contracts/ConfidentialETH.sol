// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract ConfidentialETH is ERC7984, ZamaEthereumConfig {
    event Deposited(address indexed account, uint256 amount);

    constructor() ERC7984("cETH", "cETH", "") {}

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    function deposit() external payable {
        _deposit(msg.sender, msg.value);
    }

    receive() external payable {
        _deposit(msg.sender, msg.value);
    }

    function _deposit(address account, uint256 amount) internal {
        require(amount > 0, "Amount must be greater than zero");
        require(amount <= type(uint64).max, "Amount exceeds uint64");
        euint64 encryptedAmount = FHE.asEuint64(uint64(amount));
        _mint(account, encryptedAmount);
        emit Deposited(account, amount);
    }
}
