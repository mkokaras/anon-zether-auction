const BN = require("bn.js");
const { ElGamal } = require("./utils/algebra.js");
const bn128 = require("./utils/bn128.js");
const { encrypt, decrypt, PrivateKey } = require("eciesjs");

class Bidder {
  constructor(web3, auc, home, zsc, client, client_decoy) {
    if (web3 === undefined)
      throw "Constructor's first argument should be an initialized Web3 object.";
    if (auc === undefined)
      throw "Constructor's second argument should be a deployed AUC contract object.";
    if (home === undefined)
      throw "Constructor's third argument should be the address of an unlocked Ethereum account.";
    if (zsc === undefined)
      throw "Constructor's fourth argument should be a deployed ZSC contract object.";
    if (client === undefined)
      throw "Constructor's fifth argument should be the actual account";
    if (client_decoy === undefined)
      throw "Constructor's sixth argument should be the decoy account";

    web3.transactionConfirmationBlocks = 1;

    const that = this;

    this.account = new (function () {
      this.bid = 0;
    })();

    this.revealBid = async (value, name) => {
      const y_ecies = await auc.methods.getYecies().call();

      const y_auc = await auc.methods.getYauc().call();

      this.account.bid = value;

      const r = bn128.randomScalar();

      const D = bn128.curve.g.mul(r);

      const left = ElGamal.base["g"]
        .mul(new BN(value))
        .add(bn128.deserialize(y_auc).mul(r));

      const C = new ElGamal(left, D);

      const bid_proof = await client.createBurnProof(value);

      const bid_proof_decoy = await client_decoy.createBurnProof(0);

      if (this.rand(0, 10) > 5) {
        return new Promise((resolve, reject) => {
          auc.methods
            .revealBids(
              bid_proof["y"],
              bid_proof_decoy["y"],
              bn128.serialize(C.left()),
              bn128.serialize(D),
              "0x" +
                encrypt(
                  y_ecies.slice(2),
                  Buffer.from(bid_proof["proof"])
                ).toString("hex")
            )
            .send({ from: home, gas: 6721975 })
            .on("transactionHash", (hash) => {
              console.log('Reveal submitted (txHash = "' + hash + '").' + name);
            })
            .on("receipt", (receipt) => {
              console.log("Gas cost for storing bids is : " + receipt.gasUsed);
              resolve(receipt);
            })
            .on("error", (error) => {
              console.log("Reveal failed: " + error);
              reject(error);
            });
        });
      } else {
        return new Promise((resolve, reject) => {
          auc.methods
            .revealBids(
              bid_proof_decoy["y"],
              bid_proof["y"],
              bn128.serialize(C.left()),
              bn128.serialize(D),
              "0x" +
                encrypt(
                  y_ecies.slice(2),
                  Buffer.from(bid_proof["proof"])
                ).toString("hex")
            )
            .send({ from: home, gas: 6721975 })
            .on("transactionHash", (hash) => {
              console.log('Reveal submitted (txHash = "' + hash + '").' + name);
            })
            .on("receipt", (receipt) => {
              console.log("Gas cost for storing bids is : " + receipt.gasUsed);
              resolve(receipt);
            })
            .on("error", (error) => {
              console.log("Reveal failed: " + error);
              reject(error);
            });
        });
      }
    };

    this.submitTransferProof = async (name, value, decoys, miner) => {
      const winning_bid = await auc.methods.getWinningBid().call();

      const ignore = winning_bid === this.account.bid.toString() ? true : false;

      const res = await client.createTransferProof(
        name,
        value,
        decoys,
        miner,
        ignore
      );

      const y_ecies = await auc.methods.getYecies().call();

      const pk = new PrivateKey();

      let data = {};

      const indeces = await this.findIndeces(res["y"]);

      data = this.encryptECIESTransfer(
        res["C"],
        res["D"],
        res["y"],
        res["u"],
        res["proof"],
        y_ecies,
        indeces
      );

      const result = await auc.methods
        .submitTransferArgs(
          data["C"],
          data["D"],
          data["proof"],
          data["u"],
          data["indeces"]
        )
        .send({ from: home, gas: 6721975 });

      console.log("Gas used for revealing is : " + result.gasUsed);
    };

    //-----------------------Helper Functions---------------------------

    this.findIndeces = async (y) => {
      const results = await auc.methods.getBids().call();
      const y_auc = await auc.methods.getYauc().call();
      let indeces = [];

      for (let i = 0; i < y.length; i++) {
        for (let j = 0; j < results.length; j++) {
          if (
            (y[i][0] === results[j]["y1"][0] &&
              y[i][1] === results[j]["y1"][1]) ||
            (y[i][0] === results[j]["y2"][0] && y[i][1] === results[j]["y2"][1])
          ) {
            indeces.push(j);
          }
        }
        if (y[i][0] === y_auc[0] && y[i][1] === y_auc[1]) {
          indeces.push("a");
        }
      }

      return indeces;
    };

    this.encryptECIESTransfer = (
      C,
      D,
      y,
      u,
      proof,
      auctioneer_key,
      indeces
    ) => {
      const data = {};

      let C_enc = [];

      C.forEach((value) => {
        const temp_c = [];

        temp_c.push(
          "0x" +
            encrypt(auctioneer_key.slice(2), Buffer.from(value[0])).toString(
              "hex"
            )
        );

        temp_c.push(
          "0x" +
            encrypt(auctioneer_key.slice(2), Buffer.from(value[1])).toString(
              "hex"
            )
        );

        C_enc.push(temp_c);
      });

      data["C"] = C_enc;

      let Y_enc = [];

      y.forEach((value) => {
        const temp_y = [];

        temp_y.push(
          "0x" +
            encrypt(auctioneer_key.slice(2), Buffer.from(value[0])).toString(
              "hex"
            )
        );

        temp_y.push(
          "0x" +
            encrypt(auctioneer_key.slice(2), Buffer.from(value[1])).toString(
              "hex"
            )
        );

        Y_enc.push(temp_y);
      });

      data["y"] = Y_enc;

      let D_enc = [];

      D_enc.push(
        "0x" +
          encrypt(auctioneer_key.slice(2), Buffer.from(D[0])).toString("hex")
      );

      D_enc.push(
        "0x" +
          encrypt(auctioneer_key.slice(2), Buffer.from(D[1])).toString("hex")
      );

      data["D"] = D_enc;

      let u_enc = [];

      u_enc.push(
        "0x" +
          encrypt(auctioneer_key.slice(2), Buffer.from(u[0])).toString("hex")
      );

      u_enc.push(
        "0x" +
          encrypt(auctioneer_key.slice(2), Buffer.from(u[1])).toString("hex")
      );

      data["u"] = u_enc;

      data["proof"] =
        "0x" +
        encrypt(auctioneer_key.slice(2), Buffer.from(proof)).toString("hex");

      data["indeces"] =
        "0x" +
        encrypt(
          auctioneer_key.slice(2),
          Buffer.from(indeces.toString())
        ).toString("hex");

      return data;
    };

    this.rand = (min, max) => {
      let randomNum = Math.random() * (max - min) + min;
      return Math.round(randomNum);
    };

    //-------------------------Optimized Version -------------------------------

    this.submitTransferProofOptimized = async (name, value, decoys, miner) => {
      const winning_bid = await auc.methods.getWinningBid().call();

      const ignore = winning_bid === this.account.bid.toString() ? true : false;

      const res = await client.createTransferProofOptimized(
        name,
        value,
        decoys,
        miner,
        ignore
      );

      const y_ecies = await auc.methods.getYecies().call();

      let data = {};

      const indeces = await this.findIndeces(res["y"]);

      let u_enc = [];

      u_enc.push(
        "0x" +
          encrypt(y_ecies.slice(2), Buffer.from(res["u"][0])).toString("hex")
      );

      u_enc.push(
        "0x" +
          encrypt(y_ecies.slice(2), Buffer.from(res["u"][1])).toString("hex")
      );

      data["u"] = u_enc;

      data["r"] =
        "0x" + encrypt(y_ecies.slice(2), Buffer.from(res["r"])).toString("hex");

      data["proof"] =
        "0x" +
        encrypt(y_ecies.slice(2), Buffer.from(res["proof"])).toString("hex");

      data["indeces"] =
        "0x" +
        encrypt(y_ecies.slice(2), Buffer.from(indeces.toString())).toString(
          "hex"
        );

      const result = await auc.methods
        .submitTransferArgs(
          data["proof"],
          data["r"],
          data["u"],
          data["indeces"]
        )
        .send({ from: home, gas: 6721975 });

      console.log("Gas used for revealing is : " + result.gasUsed);
    };
  }
}

module.exports = Bidder;
