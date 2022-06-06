const BN = require("bn.js");
const utils = require("./utils/utils.js");
const { ElGamal } = require("./utils/algebra.js");
const bn128 = require("./utils/bn128.js");
const bidBurnVerifier = require("./verifier/bidBurnVerifier");
const { decrypt, PrivateKey } = require("eciesjs");
class Auctioneer {
  constructor(web3, home, zsc, auc, auctioneer_client) {
    if (web3 === undefined)
      throw "Constructor's first argument should be an initialized Web3 object.";
    if (home === undefined)
      throw "Constructor's second argument should be the address of an unlocked Ethereum account.";
    if (zsc === undefined)
      throw "Constructor's third argument should be a deployed ZSC contract object.";
    if (auc === undefined)
      throw "Constructor's fourth argument should be a deployed AUC contract object.";
    if (auctioneer_client === undefined)
      throw "Constructor's fifth argument should be a Anon-Zether client";

    web3.transactionConfirmationBlocks = 1;

    const getEpoch = (timestamp) => {
      return Math.floor(
        (timestamp === undefined ? new Date().getTime() / 1000 : timestamp) / 18
      );
    };

    const that = this;

    this.account = new (function () {
      this.keypair = undefined;
      this.bids = [];
      this.winnerBid = 0;
      this.winnerAcc = [];
      this.decoys = [];
      this.actual = [];
      this.eciesPK = "";
      this.client_instace = undefined;
      this.winnerId = 0;
      this.public = () => bn128.serialize(this.keypair["y"]);
    })();

    this.friends = new (function () {
      const friends = {};
      this.add = (name, pubkey) => {
        friends[name] = bn128.deserialize(pubkey);
        return "Friend added.";
      };

      this.show = () => friends;
      this.remove = (name) => {
        if (!(name in friends))
          throw "Friend " + name + " not found in directory!";
        delete friends[name];
        return "Friend deleted.";
      };
    })();

    this.submitKeys = () => {
      return new Promise((resolve, reject) => {
        const keypair = auctioneer_client.account.keypair;

        this.keypair = keypair;

        auc.methods
          .submitKeys(bn128.serialize(keypair["y"]), this.initECIES())
          .send({ from: home, gas: 6721975 })
          .on("transactionHash", (hash) => {
            console.log('Registration submitted (txHash = "' + hash + '").');
          })
          .on("receipt", (receipt) => {
            that.account.keypair = keypair;
            console.log(
              "Gas cost for registering to Zether is :" + receipt.gasUsed
            );
            console.log("Registration successful.");
            resolve();
          })
          .on("error", (error) => {
            console.log("Registration failed: " + error);
            reject(error);
          });
      });
    };

    this.declareWinner = async () => {
      const result = this.transformValues(await auc.methods.getBids().call());

      const ret = await this.getAccountsStates(result);

      this.findWinner(result, ret);

      console.log(
        "Winner is : " +
          this.account.winnerAcc +
          "with Bid : " +
          this.account.winnerBid
      );
    };

    this.unlockBids = async () => {
      const i = this.account.actual.findIndex(
        (acc) => acc === this.account.winnerAcc
      );

      this.account.winnerId = i;

      let accToUnlock = [...this.account.actual];

      let accDecoys = [...this.account.decoys];

      accToUnlock[i] = accDecoys[i];

      const res = await auc.methods
        .unlockAccounts(accToUnlock, this.account.winnerBid)
        .send({ from: home, gas: 6721975 });

      console.log("Gas cost for unlocking bidder accounts is : " + res.gasUsed);
    };

    this.unlockRemainingBids = async () => {
      let accToUnlock = [...this.account.decoys];

      accToUnlock[this.account.winnerId] = this.account.winnerAcc;

      const res = await auc.methods
        .unlockRemainingAccounts(accToUnlock)
        .send({ from: home, gas: 6721975 });

      console.log("Gas cost for unlocking bidder accounts is : " + res.gasUsed);
    };

    this.transferWinningBid = async (client) => {
      const C_enc = await auc.methods.getC(home, 4).call();

      const DUproof = await auc.methods.getTransferArgs(home).call();

      const D_enc = DUproof.en_D;

      const U_enc = DUproof.en_U;

      const proof_enc = DUproof.en_proof;

      const indeces_en = DUproof.en_indeces;

      const transformed = this.transformTransferData(
        C_enc,
        indeces_en,
        D_enc,
        U_enc,
        proof_enc
      );

      await this.transferEarnings(transformed, client);
    };

    this.transferEarnings = async (data) => {
      const Y = await this.findYfromIndex(
        this.returnArrayFromString(data["indeces"])
      );

      await this.customTransfer(
        auc,
        data["C"],
        Y,
        data["D"],
        data["proof"],
        data["u"],
        this.friends.show(),
        "Miner #1"
      );
    };

    this.customTransfer = async (
      auc,
      C,
      y,
      D,
      proof,
      u,
      friend_list,
      beneficiary
    ) => {
      const beneficiaryKey =
        beneficiary === undefined ? bn128.zero : friend_list[beneficiary];

      await auctioneer_client.transferDummy(
        C,
        D,
        y,
        u,
        proof,
        bn128.serialize(beneficiaryKey),
        auc
      );
    };

    //----------------------- Helper Functions ------------------

    this.decrypt = (C, D) => {
      return utils.readBalance(C, D, this.account.keypair["x"]);
    };

    this.initECIES = () => {
      this.account.eciesPK = new PrivateKey();

      return "0x" + this.account.eciesPK.publicKey.toHex();
    };

    this.transformValues = (result) => {
      let transformed = [];

      result.forEach((bid) => {
        const newItem = {};
        newItem["y1"] = [bid["y1"][0], bid["y1"][1]];
        newItem["y2"] = [bid["y2"][0], bid["y2"][1]];
        newItem["proof"] = decrypt(
          this.account.eciesPK.toHex(),
          Buffer.from(this.decodeHex(bid["proof"]))
        ).toString();
        newItem["bC"] = [bid["bC"][0], bid["bC"][1]];
        newItem["bD"] = [bid["bD"][0], bid["bD"][1]];

        transformed.push(newItem);
      });

      return transformed;
    };

    this.remove0x = (hex) => {
      if (hex.startsWith("0x") || hex.startsWith("0X")) {
        return hex.slice(2);
      }
      return hex;
    };

    this.decodeHex = (hex) => {
      return Buffer.from(this.remove0x(hex), "hex");
    };

    this.checkIfInDecoys = (bid_value) => {
      let flag = false;
      this.account.decoys.forEach((value) => {
        if (bid_value[0] === value[0] && bid_value[1] === value[1]) {
          flag = true;
        }
      });

      return flag;
    };

    this.findYfromIndex = async (indeces) => {
      const bids = await auc.methods.getBids().call();

      const my_key = await auc.methods.getYauc().call();

      let y_array = [];

      indeces.forEach((value, index) => {
        if (value === "a") {
          y_array[index] = [my_key[0], my_key[1]];
        } else if (
          (bids[value]["y2"][0] == this.account.winnerAcc[0] &&
            bids[value]["y2"][1] == this.account.winnerAcc[1]) ||
          (bids[value]["y1"][0] == this.account.winnerAcc[0] &&
            bids[value]["y1"][1] == this.account.winnerAcc[1])
        ) {
          y_array[index] = [
            this.account.winnerAcc[0],
            this.account.winnerAcc[1],
          ];
        } else if (this.checkIfInDecoys(bids[value]["y1"])) {
          y_array[index] = [bids[value]["y1"][0], bids[value]["y1"][1]];
        } else {
          y_array[index] = [bids[value]["y2"][0], bids[value]["y2"][1]];
        }
      });

      return y_array;
    };

    this.returnArrayFromString = (indeces) => {
      let index = 0;
      let array = [];

      for (let i = 0; i < indeces.length; i++) {
        if (i === indeces.length - 1) {
          array.push(indeces.slice(index));
        }
        if (indeces[i] === ",") {
          array.push(indeces.slice(index, i));
          index = i + 1;
        }
      }

      return array;
    };

    this.transformTransferData = (
      C_enc,
      indeces_enc,
      D_enc,
      U_enc,
      proof_enc
    ) => {
      const newItem = {};

      newItem["C"] = [];

      newItem["Y"] = [];

      C_enc.forEach((value) => {
        const C_dec = [
          decrypt(
            this.account.eciesPK.toHex(),
            Buffer.from(this.decodeHex(value[0]))
          ).toString(),
          decrypt(
            this.account.eciesPK.toHex(),
            Buffer.from(this.decodeHex(value[1]))
          ).toString(),
        ];

        newItem["C"].push(C_dec);
      });

      newItem["indeces"] = decrypt(
        this.account.eciesPK.toHex(),
        Buffer.from(this.decodeHex(indeces_enc))
      ).toString();

      newItem["proof"] = decrypt(
        this.account.eciesPK.toHex(),
        Buffer.from(this.decodeHex(proof_enc))
      ).toString();

      newItem["D"] = [
        decrypt(
          this.account.eciesPK.toHex(),
          Buffer.from(this.decodeHex(D_enc[0]))
        ).toString(),
        decrypt(
          this.account.eciesPK.toHex(),
          Buffer.from(this.decodeHex(D_enc[1]))
        ).toString(),
      ];

      newItem["u"] = [
        decrypt(
          this.account.eciesPK.toHex(),
          Buffer.from(this.decodeHex(U_enc[0]))
        ).toString(),
        decrypt(
          this.account.eciesPK.toHex(),
          Buffer.from(this.decodeHex(U_enc[1]))
        ).toString(),
      ];

      return newItem;
    };

    this.getAccountsStates = async (bid) => {
      let CR_temp = [];

      let CL_temp = [];

      let CR2_temp = [];

      let CL2_temp = [];

      for (let i = 0; i < bid.length; i++) {
        let bid_actual = this.decrypt(bid[i]["bC"], bid[i]["bD"]);

        this.account.bids.push(bid_actual);

        let res = await zsc.methods
          .simulateAccounts([bid[i]["y1"]], getEpoch())
          .call();

        CR_temp.push([res[0][1][0], res[0][1][1]]);

        CL_temp.push([res[0][0][0], res[0][0][1]]);

        let res2 = await zsc.methods
          .simulateAccounts([bid[i]["y2"]], getEpoch())
          .call();

        CR2_temp.push([res2[0][1][0], res2[0][1][1]]);

        CL2_temp.push([res2[0][0][0], res2[0][0][1]]);
      }

      const ret = {};

      ret["CL"] = CL_temp;

      ret["CR"] = CR_temp;

      ret["CL2"] = CL2_temp;

      ret["CR2"] = CR2_temp;

      return ret;
    };

    this.findWinner = (result, ret) => {
      result.forEach((bid, index) => {
        let res = bidBurnVerifier.verifyBurn(
          ret["CL"][index],
          ret["CR"][index],
          bid["y1"],
          bid["proof"],
          this.account.bids[index]
        );

        if (res == true) {
          if (this.account.winnerBid < this.account.bids[index]) {
            this.account.winnerAcc = bid["y1"];
            this.account.winnerBid = this.account.bids[index];
          }
          this.account.actual.push(bid["y1"]);

          this.account.decoys.push(bid["y2"]);
        } else {
          res = bidBurnVerifier.verifyBurn(
            ret["CL2"][index],
            ret["CR2"][index],
            bid["y2"],
            bid["proof"],
            this.account.bids[index]
          );

          if (res == true) {
            if (this.account.winnerBid < this.account.bids[index]) {
              this.account.winnerAcc = bid["y2"];
              this.account.winnerBid = this.account.bids[index];
            }
            this.account.actual.push(bid["y2"]);

            this.account.decoys.push(bid["y1"]);
          }
        }
      });
    };
    //-------------------------- Optimized Version --------------------------------

    this.transferWinningBidOptimized = async () => {
      const data = await auc.methods.getTransferArgs(home).call();

      const transformed = this.transformTransferDataOptimized(
        data.en_indeces,
        data.en_r,
        data.en_U,
        data.en_proof
      );

      await this.transferEarningsOptimized(transformed);
    };

    this.transformTransferDataOptimized = (
      indeces_enc,
      r_enc,
      U_enc,
      proof_enc
    ) => {
      const newItem = {};

      newItem["proof"] = decrypt(
        this.account.eciesPK.toHex(),
        Buffer.from(this.decodeHex(proof_enc))
      ).toString();

      newItem["r"] = decrypt(
        this.account.eciesPK.toHex(),
        Buffer.from(this.decodeHex(r_enc))
      ).toString();

      newItem["u"] = [
        decrypt(
          this.account.eciesPK.toHex(),
          Buffer.from(this.decodeHex(U_enc[0]))
        ).toString(),
        decrypt(
          this.account.eciesPK.toHex(),
          Buffer.from(this.decodeHex(U_enc[1]))
        ).toString(),
      ];

      newItem["indeces"] = decrypt(
        this.account.eciesPK.toHex(),
        Buffer.from(this.decodeHex(indeces_enc))
      ).toString();

      return newItem;
    };

    this.transferEarningsOptimized = async (data) => {
      const r = new BN(data["r"]).toRed(bn128.q);

      const Y = await this.findYfromIndex(
        this.returnArrayFromString(data["indeces"])
      );

      const y_auc = await auc.methods.getYauc().call();

      await this.customTransferOptimized(
        auc,
        r,
        Y,
        data["proof"],
        data["u"],
        this.friends.show(),
        "Miner #1",
        this.account.winnerBid,
        [y_auc[0], y_auc[1]],
        [this.account.winnerAcc[0], this.account.winnerAcc[1]]
      );
    };

    this.customTransferOptimized = async (
      auc,
      r,
      y,
      proof,
      u,
      friend_list,
      beneficiary,
      value,
      account,
      name
    ) => {
      const beneficiaryKey =
        beneficiary === undefined ? bn128.zero : friend_list[beneficiary];

      const D = bn128.curve.g.mul(r);

      const i_yours = y.findIndex(
        (acc) => acc[0] === account[0] && acc[1] === account[1]
      );

      const i_other = y.findIndex(
        (acc) => acc[0] === name[0] && acc[1] === name[1]
      );

      const y_deserialized = y.map(bn128.deserialize);

      const C = y_deserialized.map((party, i) => {
        const left = ElGamal.base["g"]
          .mul(new BN(i === i_yours ? value : i === i_other ? -value : 0))
          .add(party.mul(r));
        return new ElGamal(left, D);
      });

      await auctioneer_client.transferDummy(
        C.map((ciphertext) => bn128.serialize(ciphertext.left())),
        bn128.serialize(D),
        y,
        u,
        proof,
        bn128.serialize(beneficiaryKey),
        auc
      );
    };
  }
}

module.exports = Auctioneer;
