import { near, assert } from 'near-sdk-js';

export interface IBid {
    buyerWallet: string,
    sellerWallet: string,
    bidContentHash: string,
    dueDate: string,
    percentageAdmin: number,
    storageDeposit: number
}

export enum BidStatus {
    Proposed,
    Accepted,
    Rejected,
    Active,
    Cancelled,
    Completed,
    Paid,
    UnderDispute,
    DisputeResolved
}

export class Bid {
    tokenToPaySeller: number;
    tokenToPayAdmin: number;
    createdOn: bigint;
    public status: BidStatus;
    public acceptedOn: bigint;
    public activeSince: bigint;
    public cancelledOn: bigint;
    public completedOn: bigint;
    public paidOn: bigint;

    constructor(
        public buyerWallet?: string,
        public sellerWallet?: string,
        public bidContentHash?: string,
        public buyerDeposit?: number,
        public dueDate?: string,
        public percentageAdmin?: number
    ) {
       
        this.createdOn = near.blockTimestamp();
        this.status = BidStatus.Proposed;
        this.tokenToPayAdmin =  percentageAdmin/100 *  buyerDeposit;
        this.tokenToPaySeller = buyerDeposit - this.tokenToPayAdmin;
    }

  }