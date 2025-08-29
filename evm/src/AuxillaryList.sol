// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.28;
import "@openzeppelin/contracts/access/Ownable.sol";

contract AuxillaryList is Ownable {
    address[] private _values;
    mapping(address => uint256) private _valueIndexes;
    mapping(address => bool) private _valueExists;

    constructor() Ownable(msg.sender) {}

    function add(address value_) public onlyOwner {
        if (_valueExists[value_]) return;

        _values.push(value_);
        _valueIndexes[value_] = _values.length - 1;
        _valueExists[value_] = true;
    }

    function safeAdd(address value_) external onlyOwner {
        require(!_valueExists[value_], "Value already exists");
        add(value_);
    }

    function remove(address value_) public onlyOwner {
        if (!_valueExists[value_]) return;

        uint256 deletionIndex = _valueIndexes[value_];
        uint256 lastIndex = _values.length - 1;

        // Move the last element to the place of the element to be removed
        if (deletionIndex != lastIndex) {
            address lastElement = _values[lastIndex];
            _values[deletionIndex] = lastElement;
            _valueIndexes[lastElement] = deletionIndex; // Update the index for the previously last element
        }

        _values.pop();
        delete _valueIndexes[value_];
        delete _valueExists[value_];
    }

    function safeRemove(address value_) external onlyOwner {
        require(_valueExists[value_], "Value does not exist");
        remove(value_);
    }

    function contains(address value_) external view returns (bool) {
        return _valueExists[value_];
    }

    function indexOf(address value_) external view returns (uint256) {
        return _valueIndexes[value_];
    }

    function length() external view returns (uint256) {
        return _values.length;
    }

    function getAll() external view returns (address[] memory) {
        return _values;
    }
}
