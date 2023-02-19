// Find all our documentation at https://docs.near.org
import { NearBindgen, near, call, view, Vector, bytes, includeBytes } from 'near-sdk-js';
import { assert } from 'near-sdk-js';

const ONE_TGAS = BigInt("10000000000000");
const THREE_TGAS = BigInt("30000000000000");

type Bid = {
  bidId: string,
  buyerWallet: string,
  sellerWallet: string,
  accountId: string
}

type createBidDto = {
  bidId: string,
  sellerWallet: string,
  bidContentHash: string,
  dueDate: string,
  storageDeposit: number
}

@NearBindgen({})
class Main {

  bids: Vector<Bid>;

  constructor() {
    this.bids = new Vector<Bid>('m');
  }

  @call({payableFunction: true})
  createBid({
    bidId,
    sellerWallet,
    bidContentHash,
    dueDate,
    storageDeposit
  }: createBidDto) {

    assert(this._checkUniqueBidId(bidId) === true, "Bid ID should be unique");
    const amount = near.attachedDeposit(); // bid Cost + storage Deposit
    const promise = near.promiseBatchCreate(`${bidId}.${near.currentAccountId()}`);
    near.promiseBatchActionCreateAccount(
      promise
    )
   /*near.promiseBatchActionTransfer(
      promise,
      storageDeposit
    )*/
    near.promiseBatchActionDeployContract(
      promise,
      includeBytes('../../escrow/build/escrow.wasm')
    )
    near.promiseBatchActionFunctionCall(
      promise,
      "createBid",
      bytes(JSON.stringify({ 
        buyerWallet: near.predecessorAccountId(),
        sellerWallet,
        bidContentHash,
        dueDate,
        percentageAdmin: 10 as unknown as bigint,
        storageDeposit
      })),
      amount,
      ONE_TGAS
    );
    
    near.promiseThen(
      promise,
      near.currentAccountId(),
      "_on_successfull_bid_create",
      bytes(JSON.stringify({
        bidId,
        sellerWallet,
        buyerWallet: near.predecessorAccountId(),
        accountId: `${bidId}.${near.currentAccountId()}`
      })),
      0,
      THREE_TGAS
    );

    return near.promiseReturn(promise)
  }

  @call({ privateFunction: true })
  _on_successfull_bid_create({ 
    bidId,
    sellerWallet,
    buyerWallet,
    accountId
   }) {
    near.log("successful bid create")
    this.bids.push({ 
      bidId,
      sellerWallet,
      buyerWallet,
      accountId
     })
  }

  @view({})
  getBids({
    accountId
  }: {
    accountId?: string
  }) {
      if (accountId) {
        return this.bids.toArray().filter(bid => {
          return bid.buyerWallet === accountId || bid.sellerWallet === accountId
        })
      }
      return this.bids.toArray()
  }

  _checkUniqueBidId(bidId: string): boolean {
    return !this.bids.toArray().find(bid => bid.bidId === bidId);
  }

}