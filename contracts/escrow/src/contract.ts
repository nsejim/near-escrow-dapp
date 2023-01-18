// Find all our documentation at https://docs.near.org
import { NearBindgen, near, call, view, initialize, assert } from 'near-sdk-js';
import { Bid, BidStatus, IBid } from './models/bid';

const YOCTO = BigInt("1000000000000000000000000") as bigint;

@NearBindgen({ requireInit: true })
class Escrow {

  admin: string = "";
  bid: Bid = new Bid();

  @initialize({})
  @call({ payableFunction: true })
  createBid({buyerWallet, sellerWallet, bidContentHash, dueDate, percentageAdmin, storageDeposit}: IBid) {
    
    assert(!this.admin, "Contract already initialized")

    this.admin = near.predecessorAccountId();

    assert(!!buyerWallet, "Buyer wallet is required")
    assert(!!sellerWallet, "Seller wallet is required")

    const bidCost = near.attachedDeposit() - BigInt(storageDeposit) * YOCTO;
    assert(bidCost > 0, 'The attached deposit should be greater than zero')

    const bidCostToken = Number(bidCost/YOCTO);

    assert(percentageAdmin >= 0, "Percentage should be between 0 and 100")
    assert(percentageAdmin <= 100, "Percentage should be between 0 and 100")
    
    this.bid = new Bid(buyerWallet, sellerWallet, bidContentHash, bidCostToken, dueDate, percentageAdmin);
    near.log(`Bid created and proposed to the seller`)
  }

  @call({})
  acceptBid() {
    assert(near.predecessorAccountId() === this.bid.sellerWallet, 'Only seller can accept a bid')
    assert(this.bid.status === BidStatus.Proposed, "Bid status must to be in the prooposed status")
    this.bid.status = BidStatus.Accepted;
    this.bid.acceptedOn = near.blockTimestamp();
    near.log(`Seller accepted the bid`)
  }

  @call({})
  startBid() {
    assert(near.predecessorAccountId() === this.bid.buyerWallet, 'Only buyer can start a bid')
    assert(this.bid.status === BidStatus.Accepted, "Bid status must to be in the accepted status")
    this.bid.status = BidStatus.Active;
    this.bid.activeSince = near.blockTimestamp();
    near.log(`The bid contract is now active`)
  }


  @call({})
  cancelBid() {
    assert((near.predecessorAccountId() === this.bid.buyerWallet) || (near.predecessorAccountId() === this.bid.sellerWallet), 'Only either seller or buyer can cancel the bid')
    assert(this.bid.status !== BidStatus.Completed, "Bid status must not be completed yet")
    this.bid.status = BidStatus.Cancelled;
    this.bid.cancelledOn = near.blockTimestamp();
    near.log(`The contract status is set to cancelled`)

    this._deleteAccount();

  }

  @call({})
  completeBid() {
    assert(near.predecessorAccountId() === this.bid.sellerWallet, 'Only seller can confirm the he/she completed the bid')
    assert(this.bid.status === BidStatus.Active, "Bid status must to be in the active status")
    this.bid.status = BidStatus.Completed;
    this.bid.completedOn = near.blockTimestamp();
    near.log(`Bid status set to completed`)

  }

  @call({})
  payBid() {
    near.log(`Balance before payment: ${near.accountBalance()/YOCTO}`)
    assert(near.predecessorAccountId() === this.bid.buyerWallet, 'Only buyer can execute payment')
    assert(this.bid.status === BidStatus.Completed, "Bid has to be completed to process the payment")
    assert(near.accountBalance() >= this.bid.buyerDeposit, "Not enough balance to pay")
    near.log(`NEAR token to transfer to seller: ${this.bid.tokenToPaySeller}`)
    this._transferToken({
      receivingAccountId: this.bid.sellerWallet,
      amount: BigInt(this.bid.tokenToPaySeller) * YOCTO
    })
    near.log(`seller paid`)

    near.log(`NEAR token commission to transfer to admin: ${this.bid.tokenToPayAdmin}`)
    this._transferToken({
      receivingAccountId: this.admin,
      amount: BigInt(this.bid.tokenToPayAdmin) * YOCTO
    })
    near.log(`Admin commission paid`)

    this.bid.status = BidStatus.Paid;

    this._deleteAccount();
  }

  @view({})
  getBid(): Bid{
    near.log('`Get bid data')
    return this.bid;
  }

  @view({})
  getAdmin(): string {
    near.log('`Get admin')
    return this.admin;
  }

  _transferToken({ receivingAccountId, amount }: {
    receivingAccountId: string;
    amount: bigint
  }) {

    const promise = near.promiseBatchCreate(receivingAccountId);
    near.promiseBatchActionTransfer(
      promise,
      amount
    )
    return near.promiseReturn(promise)
  }

  _deleteAccount() {
    near.log(`Balance before delete: ${near.accountBalance()/YOCTO}`)
    const promise = near.promiseBatchCreate(near.currentAccountId());
    near.promiseBatchActionDeleteAccount(
      promise,
      this.bid.buyerWallet
    )

    near.log(`The contract deleted and balance transfered to buyer`)
    return near.promiseReturn(promise)
  }

}