// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "./CaretOrchestrator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CaretEscrow {
    address public owner;
    address public actor;
    CaretOrchestrator public orchestrator;

    modifier onlyServer() {
        require(msg.sender == address(orchestrator.server()), "Not the server");
        _;
    }

    modifier onlyActor() {
        require(msg.sender == actor, "Not the actor");
        _;
    }

    constructor(address actor_) {
        orchestrator = CaretOrchestrator(msg.sender);
        actor = actor_;
    }

    function balance(address token_) external view returns (uint256) {
        return IERC20(token_).balanceOf(address(this));
    }

    function releaseFunds(
        address token_,
        address to_,
        uint256 amount_
    ) external onlyServer {
        IERC20(token_).transfer(to_, amount_);
    }

    function fundActor(address token_, uint256 amount_) external onlyActor {
        IERC20(token_).transfer(actor, amount_);
    }
}
