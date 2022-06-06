const ABICoder = require("web3-eth-abi");
const BN = require("bn.js");
const bn128 = require("../utils/bn128.js");
const utils = require("../utils/utils.js");

class bidBurnVerifier {
  static verifyBurn(CLn, CRn, y, proof, balance) {
    const statement = {};
    statement["CLn"] = bn128.deserialize(CLn);
    statement["CRn"] = bn128.deserialize(CRn);
    statement["y"] = bn128.deserialize(y);
    statement["b"] = balance;

    const burnProof = this.unserialize(proof);

    return this.verify(statement, burnProof);
  }

  static verify(statement, proof) {
    const sigmaAuxiliaries = {};

    const temp = statement["CLn"].add(
      bn128.curve.g.mul(new BN(statement["b"]).toRed(bn128.q).redNeg())
    );

    sigmaAuxiliaries["A_b"] = statement["CRn"]
      .mul(new BN(proof["s_sk"]).toRed(bn128.q))
      .add(temp.mul(new BN(proof["c"]).toRed(bn128.q).redNeg()));

    sigmaAuxiliaries["c"] = new BN(
      utils.hash(
        ABICoder.encodeParameters(
          ["bytes32[2]", "bytes32[2]"],
          [
            bn128.serialize(statement["y"]),
            bn128.serialize(sigmaAuxiliaries["A_b"]),
          ]
        )
      )
    );

    if (sigmaAuxiliaries["c"].toString() === proof["c"]) {
      console.log("Verification passed");
      return true;
    } else return false;
  }

  static unserialize(arr) {
    const proof = {};

    arr = arr.slice(2);

    proof["c"] = new BN(arr.slice(0, 64), 16).toString();

    proof["s_sk"] = new BN(arr.slice(64, 128), 16).toString();

    return proof;
  }
}

module.exports = bidBurnVerifier;
