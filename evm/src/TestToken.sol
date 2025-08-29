// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestToken is ERC20 {
    address public orchestrator;
    IERC20 public usdt;

    constructor(
        string memory name,
        string memory symbol,
        address usdt_
    ) ERC20(name, symbol) {
        _mint(address(this), 1_000_000_000_000_000_000 * 10 ** decimals());
        orchestrator = msg.sender;
        usdt = IERC20(usdt_);
    }

    function buy(uint256 amount, uint256 cost) external {
        usdt.transferFrom(msg.sender, address(this), cost);
        _transfer(address(this), msg.sender, amount);
    }

    function sell(uint256 amount, uint256 revenue) external {
        _transfer(msg.sender, address(this), amount);
        usdt.transfer(msg.sender, revenue);
    }
}
