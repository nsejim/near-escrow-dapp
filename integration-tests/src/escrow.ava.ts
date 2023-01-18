import { Worker, NearAccount, NEAR } from 'near-workspaces';
import anyTest, { TestFn } from 'ava';
import * as path from 'path';

const initialBuyerBalance = 1000; // NEAR tokens

const bidCost = 500; // NEAR tokens
const storageDeposit = 10; // NEAR tokens
const percentageAdmin = 10; // 10%

const THREE_TGAS = BigInt("30000000000000");

let adminBalanceBefore: any;

const test = anyTest as TestFn<{
  worker: Worker;
  accounts: Record<string, NearAccount>;
}>;

test.beforeEach(async (t) => {
  // Init the worker and start a Sandbox server
  const worker = await Worker.init();
  const root = worker.rootAccount;

  // Create admin, buyer and seller accounts
  const admin = await root.createSubAccount('admin');
  adminBalanceBefore = (await admin.balance()).total
  
  const buyer = await root.createSubAccount('buyer', {
    initialBalance: NEAR.parse(initialBuyerBalance.toString() + " N").toJSON(),
  });

  const seller = await root.createSubAccount('seller');

  // Buyer transfers to admin bidCost + storageDeposit
  await buyer.transfer(admin.accountId, (bidCost + storageDeposit).toString() + " N")

  // Admin creates escrow account for the buyer and seller
  const contract = await admin.createSubAccount('escrow', {
    initialBalance: NEAR.parse(storageDeposit.toString() + " N").toJSON(),
  });


  // An escrow account is deployed on the new escrow account
  await contract.deploy(
    path.join(__dirname,  "../../contracts/escrow/build/escrow.wasm")
  );
  
  // Admin creates a bid on the new escrow account by attaching the bid cost received from the buyer
  await admin.call(
        contract.accountId,
        "createBid",
        {
            buyerWallet: buyer.accountId,
            sellerWallet: seller.accountId,
            bidContentHash: "",
            dueDate:"22/12/2022",
            percentageAdmin,
            storageDeposit
        }, {
            attachedDeposit: NEAR.parse((bidCost + storageDeposit).toString() + " N").toJSON(),
            gas: THREE_TGAS.toString()
        }
    )
  // Save state for test runs, it is unique for each test
  t.context.worker = worker;
  t.context.accounts = { root, contract, admin, buyer, seller};
});

test.afterEach.always(async (t) => {
  // Stop Sandbox server
  await t.context.worker.tearDown().catch((error) => {
    console.log('Failed to stop the Sandbox:', error);
  });
});

test('Test create bid', async(t) => {

   // Arrange
    const { contract, admin } = t.context.accounts;

    // Assert
    const adminBid = await contract.view("getAdmin")
    t.is(adminBid, admin.accountId)
    
    const bid: any = await contract.view("getBid")

    console.log(bid)
    t.is(bid.buyerDeposit, bidCost, "Deposit amount doesn't match")
    t.is(bid.tokenToPaySeller, bidCost * (1 - percentageAdmin/100), "Wrong amount to pay the seller")
    t.is(bid.tokenToPayAdmin, bidCost * (percentageAdmin/100), "Wrong commission for admin")
    t.is(bid.status, 0, "Wrong status of the contract")

})

test('Test bid lifecycle', async(t) => {
    let bid: any;

    // Arrange
    const { contract, buyer, seller, admin } = t.context.accounts;

    // Accept bid
    await seller.call(contract.accountId, "acceptBid", {})
    bid = await contract.view("getBid")
    t.is(bid.status, 1, "Wrong status of the contract")

    // Start bid
    await buyer.call(contract.accountId, "startBid", {})
    bid = await contract.view("getBid")
    t.is(bid.status, 3, "Wrong status of the contract")

    // Complete bid
    await seller.call(contract.accountId, "completeBid", {})
    bid = await contract.view("getBid")
    t.is(bid.status, 5, "Wrong status of the contract")

    console.log(bid)

    // Pay bid
    await buyer.call(contract.accountId, "payBid", {}, {
      gas: THREE_TGAS.toString()
    })

     // Account should be deleted
    t.assert(!(await contract.exists()), "Account should have been deleted");
    
    const adminBalanceAfter = (await admin.balance()).total
    
    console.log("Admin before:", adminBalanceBefore.toHuman())
    console.log("Admin after:", adminBalanceAfter.toHuman())

})