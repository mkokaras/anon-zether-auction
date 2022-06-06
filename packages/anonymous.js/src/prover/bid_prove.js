const ABICoder = require("web3-eth-abi");
const bn128 = require("../utils/bn128.js");
const utils = require("../utils/utils.js");

class BidProof {
  constructor() {
    this.serialize = () => {
      // please initialize this before calling this method...
      let result = "0x";
      result += bn128.bytes(this.c).slice(2);
      result += bn128.bytes(this.s_sk).slice(2);

      return result;
    };
  }

  static prove(statement, witness) {
    const result = new BidProof();

    const k_sk = bn128.randomScalar();

    const A_c = statement["Cn"].right().mul(k_sk);

    const c = utils.hash(
      ABICoder.encodeParameters(
        ["bytes32[2]", "bytes32[2]"],
        [bn128.serialize(statement["y"]), bn128.serialize(A_c)]
      )
    );

    result.c = c;

    const s_sk = k_sk.redAdd(c.redMul(witness["sk"]));

    result.s_sk = s_sk;

    return result;
  }
}

module.exports = BidProof;
