const CashToken = artifacts.require("CashToken");
const ZSC = artifacts.require("ZSC");
const AUC = artifacts.require("Auction");
const Client = require("../../anonymous.js/src/client.js");
const Auctioneer = require("../../anonymous.js/src/auctioneer.js");
const Bidder = require("../../anonymous.js/src/bidder.js");
const BIDDERS = 3;
const OPTIMIZED = false;
const epochLength = 18;

const away = () => {
  const current = new Date().getTime();
  return (
    Math.ceil(current / (epochLength * 1000)) * (epochLength * 1000) - current
  );
};

contract("ZSC", async (accounts) => {
  let auctioneer;

  let bidders = [];

  let bidders_actual = [];

  let bidders_decoys = [];

  let Bidder_instances = [];

  let anon_set = [];

  let miners = [];

  let auctioneer_client;

  //----------------------------Initialization process----------------------------

  it("should allow minting and approving", async () => {
    const cash = await CashToken.deployed();
    const zsc = await ZSC.deployed();

    await cash.mint(accounts[0], 10000);
    await cash.approve(zsc.contract._address, 10000);
    const balance = await cash.balanceOf.call(accounts[0]);
    assert.equal(balance, 10000, "Minting failed");
  });

  it("should allow AUC,auctioneer initialization", async () => {
    const auc = await AUC.deployed();

    const zsc = await ZSC.deployed();

    auctioneer_client = new Client(web3, zsc.contract, accounts[0]);

    await auctioneer_client.register();

    auctioneer = new Auctioneer(
      web3,
      accounts[0],
      zsc.contract,
      auc.contract,
      auctioneer_client
    );

    await auctioneer.submitKeys();
  });

  it("should allow bidder accounts initialization", async () => {
    const auc = await AUC.deployed();

    const zsc = await ZSC.deployed();

    for (let i = 0; i < BIDDERS; i++) {
      bidders[i] = new Client(web3, zsc.contract, accounts[0]);
    }

    await Promise.all(bidders.map((bidder) => bidder.register()));

    await Promise.all(bidders.map((bidder) => bidder.deposit(100)));
  });

  it("should allow actual,decoy,anon-set,miner accounts initialization", async () => {
    const zsc = await ZSC.deployed();

    for (let i = 0; i < BIDDERS; i++) {
      bidders_actual[i] = new Client(web3, zsc.contract, accounts[0]);
      bidders_decoys[i] = new Client(web3, zsc.contract, accounts[0]);
    }

    await Promise.all(bidders_actual.map((bidder) => bidder.register()));

    await Promise.all(bidders_decoys.map((bidder) => bidder.register()));

    for (let i = 0; i < BIDDERS; i++) {
      miners[i] = new Client(web3, zsc.contract, accounts[0]);
    }

    await Promise.all(miners.map((miner) => miner.register()));

    for (let i = 0; i < BIDDERS; i++) {
      anon_set[i] = new Client(web3, zsc.contract, accounts[0]);
    }

    await Promise.all(anon_set.map((anon_member) => anon_member.register()));
  });

  it("should allow bidder client initialization", async () => {
    const auc = await AUC.deployed();

    const zsc = await ZSC.deployed();

    for (let i = 0; i < BIDDERS; i++) {
      Bidder_instances[i] = new Bidder(
        web3,
        auc.contract,
        accounts[0],
        zsc.contract,
        bidders_actual[i],
        bidders_decoys[i]
      );
    }
  });

  it("should allow adding friends", async () => {
    for (let i = 0; i < BIDDERS; i++) {
      for (let j = 0; j < BIDDERS; j++) {
        if (i != j) {
          bidders_actual[i].friends.add(
            "Bidder Decoy #" + j,
            bidders_decoys[j].account.public()
          );
        }
      }
      bidders_actual[i].friends.add("Auctioneer", auctioneer.account.public());

      bidders_actual[i].friends.add("Miner #" + i, miners[i].account.public());
    }

    for (let i = 0; i < BIDDERS; i++) {
      bidders[i].friends.add(
        "Bidder Actual #" + i,
        bidders_actual[i].account.public()
      );
      bidders[i].friends.add(
        "Bidder Decoy #" + i,
        bidders_decoys[i].account.public()
      );
      bidders[i].friends.add("Miner #" + i, miners[i].account.public());

      bidders[i].friends.add("Anon-Member #" + i, anon_set[i].account.public());

      bidders[i].friends.add("Auctioneer", auctioneer.account.public());

      auctioneer.friends.add(
        "Bidder Actual #" + i,
        bidders_actual[i].account.public()
      );
      auctioneer.friends.add(
        "Bidder Decoy #" + i,
        bidders_decoys[i].account.public()
      );

      auctioneer.friends.add("Miner #" + i, miners[i].account.public());
    }
  });

  it("should allow bid transfering", async () => {
    for (let i = 0; i < BIDDERS; i++) {
      await bidders[i].transfer(
        "Bidder Actual #" + i,
        i + 1,
        ["Bidder Decoy #" + i, "Anon-Member #" + i],
        "Miner #" + i
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    for (let i = 0; i < BIDDERS; i++) {
      assert.equal(
        bidders_actual[i].account.balance(),
        i + 1,
        "Transfer failed"
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  });

  //----------------------------Bidding process----------------------------

  it("should allow bidding", async () => {
    const auc = await AUC.deployed();

    const wait = away();

    console.log(
      "Wait " + Math.ceil(wait / 1000) + " seconds until next epoch!"
    );

    await new Promise((resolve) => setTimeout(resolve, wait));

    await Promise.all(
      bidders_actual.map((bidder) => bidder.lock(auc.contract._address))
    );

    await Promise.all(
      bidders_decoys.map((bidder) => bidder.lock(auc.contract._address))
    );
  });

  it("should allow revealing bids", async () => {
    const wait = away();

    console.log(
      "Wait " + Math.ceil(wait / 1000) + " seconds until next epoch!"
    );

    await new Promise((resolve) => setTimeout(resolve, wait));

    await Promise.all(
      Bidder_instances.map((bidder, index) =>
        bidder.revealBid(index + 1, "Bidder #" + index)
      )
    );
  });

  it("should declare winning bid and winner", async () => {
    const wait = away();

    console.log(
      "Wait " + Math.ceil(wait / 1000) + " seconds until next epoch!"
    );

    await new Promise((resolve) => setTimeout(resolve, wait));

    await auctioneer.declareWinner();
  });

  it("should unlock accounts", async () => {
    const wait = away();

    console.log(
      "Wait " + Math.ceil(wait / 1000) + " seconds until next epoch!"
    );

    await new Promise((resolve) => setTimeout(resolve, wait));

    await auctioneer.unlockBids();
  });

  it("should submit transfer proof", async () => {
    const wait = away();

    console.log(
      "Wait " + Math.ceil(wait / 1000) + " seconds until next epoch!"
    );

    await new Promise((resolve) => setTimeout(resolve, wait));

    if (OPTIMIZED) {
      for (let i = 0; i < BIDDERS; i++) {
        await Bidder_instances[i].submitTransferProofOptimized(
          "Auctioneer",
          i + 1,
          bidders
            .map((bidder, index) => {
              if (index != i) {
                return "Bidder Decoy #" + index;
              }
            })
            .filter((bidder) => bidder !== undefined),
          "Miner #" + i
        );
      }
    } else {
      for (let i = 0; i < BIDDERS; i++) {
        await Bidder_instances[i].submitTransferProof(
          "Auctioneer",
          i + 1,
          bidders
            .map((bidder, index) => {
              if (index != i) {
                return "Bidder Decoy #" + index;
              }
            })
            .filter((bidder) => bidder !== undefined),
          "Miner #" + i
        );
      }
    }
  });

  it("should transfer winning bid", async () => {
    if (OPTIMIZED) {
      await auctioneer.transferWinningBidOptimized();
    } else {
      await auctioneer.transferWinningBid();
    }
  });

  it("should unlock of remaining accounts", async () => {
    const wait = away();

    console.log(
      "Wait " + Math.ceil(wait / 1000) + " seconds until next epoch!"
    );

    await new Promise((resolve) => setTimeout(resolve, wait));

    await auctioneer.unlockRemainingBids();
  });

  it("should check winning bid equality", async () => {
    assert.equal(
      await auctioneer_client.readBalance(),
      BIDDERS,
      "Transfer Failed"
    );
  });
});
