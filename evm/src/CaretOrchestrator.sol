// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CaretEscrow.sol";
import "./TestToken.sol";

contract CaretOrchestrator {
    address public server;
    IERC20 public usdt;

    mapping(uint256 => address[]) public actors; //maps users to actors
    mapping(address => bool) public isActor;
    mapping(address => address) public escrows; //maps actors to escrows
    mapping(string => address) public tokens; //maps token symbols to addresses

    modifier onlyServer() {
        require(msg.sender == server, "Not the server");
        _;
    }

    constructor(address server_, address usdt_) {
        server = server_;
        usdt = IERC20(usdt_);
    }

    function registerActor(uint256 owner_, address actor_) external onlyServer {
        require(!isActor[actor_], "Actor already registered");
        actors[owner_].push(actor_);
        isActor[actor_] = true;
        escrows[actor_] = address(new CaretEscrow(actor_));
    }

    function registerToken(
        string memory name,
        string memory symbol
    ) external onlyServer returns (address) {
        address token = address(new TestToken(name, symbol, address(usdt)));
        tokens[symbol] = token;
        return token;
    }
}
