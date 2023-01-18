import { Worker, NearAccount, NEAR } from 'near-workspaces';
import anyTest, { TestFn } from 'ava';

const initialBuyerBalance = 1000; // NEAR tokens
const bidCost = 500; // NEAR tokens
const storageDeposit = 10; // NEAR tokens
const percentageAdmin = 10; // 10%
const bidId = "111111";

const test = anyTest as TestFn<{
  worker: Worker;
  accounts: Record<string, NearAccount>;
}>;

test.beforeEach(async (t) => {
  // Init the worker and start a Sandbox server
  const worker = await Worker.init();

  // Deploy contract
  const root = worker.rootAccount;

  const contract = await root.createSubAccount('main');

  // Get wasm file path from package.json test script in folder above
  await contract.deploy(
    __dirname + "/../../contracts/main/build/main.wasm"
  );

  const buyer = await root.createSubAccount('buyer', {
    initialBalance: NEAR.parse(initialBuyerBalance.toString() + " N").toJSON(),
  });

  const seller = await root.createSubAccount('seller');

  // Act
  await buyer.call(
    contract.accountId,
    'createBid',
    {
      bidId,
      sellerWallet: seller.accountId,
      bidContentHash: "",
      dueDate: "22/11/2022",
      storageDeposit
    }, {
    attachedDeposit: NEAR.parse((bidCost + storageDeposit).toString() + " N").toJSON(),
    gas: "300000000000000"
  }
  )

  // Save state for test runs, it is unique for each test
  t.context.worker = worker;
  t.context.accounts = { root, contract, buyer, seller };
});

test.afterEach.always(async (t) => {
  // Stop Sandbox server
  await t.context.worker.tearDown().catch((error) => {
    console.log('Failed to stop the Sandbox:', error);
  });
});

test('Bid contract initialisation', async (t) => {
  // Arrange
  const { root, contract } = t.context.accounts;

  // Assert
  const bidAccountId = `${bidId}.${contract.accountId}`;
  const bidAccount = root.getAccount(bidAccountId)
  t.true(await bidAccount.exists(), "Bid contract doesn't exist")

  const bids: any = await contract.view("getBids", {});

  t.true(bids && (bids.length === 1), "Bid not created")
  t.is(bids[0].accountId, bidAccountId, "Bid not found")

})


test('Bid contract state', async (t) => {

  // Arrange
  const { root, contract } = t.context.accounts;

  const bidAccountId = `${bidId}.${contract.accountId}`;
  const bidAccount = root.getAccount(bidAccountId)

  const bid: any = await bidAccount.view("getBid")
  t.is(bid.buyerDeposit, bidCost, "Deposit amount doesn't match")
  t.is(bid.tokenToPaySeller, bidCost * (1 - percentageAdmin / 100), "Wrong amount to pay the seller")
  t.is(bid.tokenToPayAdmin, bidCost * (percentageAdmin / 100), "Wrong combid for admin")
  t.is(bid.status, 0, "Wrong status of the contract")

  const admin: any = await bidAccount.view("getAdmin")
  t.is(admin, contract.accountId, "The admin account is not correct")

})


test('Bid contract locked', async (t) => {
  // Arrange
  const { root, contract } = t.context.accounts;

  const bidAccountId = `${bidId}.${contract.accountId}`;
  const bidAccount = root.getAccount(bidAccountId)

  t.is(await bidAccount.getKey(), null, "Contract is not locked")
})

test('Bid lifecycle', async (t) => {
  let bid: any;

  // Arrange
  const { contract, buyer, seller, root } = t.context.accounts;
  const bidAccountId = `${bidId}.${contract.accountId}`;
  const bidAccount = root.getAccount(bidAccountId)

  // Accept bid
  await seller.call(bidAccount.accountId, "acceptBid", {})
  bid = await bidAccount.view("getBid")
  t.is(bid.status, 1, "Wrong status of the contract")

  // Start bid
  await buyer.call(bidAccount.accountId, "startBid", {})
  bid = await bidAccount.view("getBid")
  t.is(bid.status, 3, "Wrong status of the contract")

  // Complete bid
  await seller.call(bidAccount.accountId, "completeBid", {})
  bid = await bidAccount.view("getBid")
  t.is(bid.status, 5, "Wrong status of the contract")

  console.log(bid)

  const buyerBalanceBefore = (await buyer.balance()).total
  const adminBalanceBefore = (await contract.balance()).total
  // Pay bid
  await buyer.call(bidAccount.accountId, "payBid", {}, {
    gas: "300000000000000"
  })

  // Account should be deleted
  t.assert(!(await bidAccount.exists()), "Account should have been deleted");

  const buyerBalanceAfter = (await buyer.balance()).total
  const adminBalanceAfter = (await contract.balance()).total
  //console.log("Buyer before:", buyerBalanceBefore.toHuman());
  //console.log("Buyer after:", buyerBalanceAfter.toHuman());
  //console.log("Admin before:", adminBalanceBefore.toHuman());
  //console.log("Admin after:", adminBalanceAfter.toHuman());
  //console.log("Admin after:", adminBalanceAfter.toHuman())


})