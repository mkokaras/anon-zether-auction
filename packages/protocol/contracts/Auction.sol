    
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "./ZSC.sol";
import "./Utils.sol";
import "./CashToken.sol";

contract Auction{
    using Utils for Utils.G1Point;

    ZSC zsc;

    bytes public y_ecies;

    Utils.G1Point public y_auc;

    BurnProof[] public burnProofs;

    mapping(bytes32 => encG1Point) cEncrypted;

    mapping(bytes32 => TransferData) transferdata;
    
    uint256 winningBid;

    constructor(address _zsc){
        zsc = ZSC(_zsc);
    }
    
    struct TransferData{
        bytes en_proof;
        encG1Point en_D;
        encG1Point en_U;
        bytes en_indeces;
    }
    
    /*
    struct TransferData{
        bytes en_proof;
        encG1Point en_U;
        bytes en_indeces;
        bytes en_r;
    }*/



    struct encG1Point{
        bytes en_x;
        bytes en_y;
    }


    struct BurnProof{
        Utils.G1Point y1;
        Utils.G1Point y2;
        bytes proof;
        Utils.G1Point bC;
        Utils.G1Point bD;
        address sender;
    }

    function submitKeys(Utils.G1Point memory _y_auc, bytes memory _y_ecies) public{
        y_ecies = _y_ecies;
        y_auc = _y_auc;
    }

    
    
    function revealBids(Utils.G1Point memory y1,Utils.G1Point memory y2, Utils.G1Point memory bC, Utils.G1Point memory bD,bytes memory proof) public{
        BurnProof memory burnProof;

        burnProof.y1 = y1;

        burnProof.y2 = y2;

        burnProof.bC= bC;

        burnProof.bD = bD;

        burnProof.proof = proof;

        burnProof.sender = msg.sender;

        burnProofs.push(burnProof);
    }


    function unlockAccounts(Utils.G1Point[] memory y,uint256 _winningBid) public {
        uint256 size = y.length;
        
        winningBid = _winningBid;
        
        for (uint256 i = 0; i <size ;i++){
            zsc.unlock(y[i]);
        }
    }

    function unlockRemainingAccounts(Utils.G1Point[] memory y) public{
        uint256 size = y.length;

        for (uint256 i = 0; i <size ;i++){
            zsc.unlock(y[i]);
        }
    }


    /*

    function submitTransferArgs(bytes memory proof,bytes memory randomness,encG1Point memory u,bytes memory indeces) public{
        TransferData memory transferArgs;

        transferArgs.en_U = u;

        transferArgs.en_proof = proof;

        transferArgs.en_r = randomness;

        transferArgs.en_indeces = indeces;

        bytes32 senderHash = keccak256(abi.encode(msg.sender));

        transferdata[senderHash] = transferArgs;
    }*/


    function submitTransferArgs(encG1Point[] memory c,encG1Point memory d,bytes memory proof,encG1Point memory u,bytes memory indeces) public{
        uint256 size = c.length;

        TransferData memory transferArgs;


        for (uint256 i = 0; i < size; i++) {
            bytes32 yHash = keccak256(abi.encode(i,msg.sender));

            cEncrypted[yHash] = c[i];

        }

        transferArgs.en_indeces = indeces;

        transferArgs.en_D = d;

        transferArgs.en_U = u;

        transferArgs.en_proof = proof;

        bytes32 senderHash = keccak256(abi.encode(msg.sender));

        transferdata[senderHash] = transferArgs;
    }


    function transferEarnings(Utils.G1Point[] memory C, Utils.G1Point memory D, Utils.G1Point[] memory y, Utils.G1Point memory u, bytes memory proof, Utils.G1Point memory beneficiary) public {
        zsc.transfer(C, D, y, u, proof, beneficiary);
    }

    function getBids() public view returns(BurnProof[] memory){
        return burnProofs;
    }

    function getYecies() public view returns (bytes memory){
        return y_ecies;
    }
    function getYauc() public view returns (Utils.G1Point memory){
        return y_auc;
    }

    function getTransferArgs(address sender) public view returns(TransferData memory){
        bytes32 senderHash = keccak256(abi.encode(sender));

        return transferdata[senderHash];
        
    }

    function getWinningBid() public view returns(uint256){
        return winningBid;
    }

    function getC(address sender,uint256 size) public view returns(encG1Point[] memory c){
        
        c = new encG1Point[](size);

        for (uint256 i = 0; i < size; i++) {

            bytes32 yHash = keccak256(abi.encode(i,sender));

            c[i] =  cEncrypted[yHash];

        }
        
    }
}