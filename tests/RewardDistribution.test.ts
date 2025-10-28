import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, principalCV, boolCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 300;
const ERR_WALLET_NOT_FOUND = 301;
const ERR_POOL_NOT_FOUND = 302;
const ERR_NO_CONTRIBUTION = 303;
const ERR_INVALID_REWARD_RATE = 304;
const ERR_REWARD_ALREADY_CLAIMED = 309;
const ERR_INVALID_AMOUNT = 310;
const ERR_AUTHORITY_NOT_VERIFIED = 307;
const ERR_TOKEN_CONTRACT_NOT_SET = 312;

interface RewardClaim {
  amount: number;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class RewardDistributionContractMock {
  state: {
    authorityContract: string | null;
    walletContract: string;
    anonContract: string;
    tokenContract: string;
    rewardRate: number;
    totalRewards: number;
    rewardClaims: Map<string, RewardClaim>;
  } = {
    authorityContract: null,
    walletContract: "SP000000000000000000002Q6VF78",
    anonContract: "SP000000000000000000002Q6VF78",
    tokenContract: "SP000000000000000000002Q6VF78",
    rewardRate: 10,
    totalRewards: 0,
    rewardClaims: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  walletMock: Map<string, { exists: boolean }> = new Map();
  anonMock: Map<
    number,
    { exists: boolean; entries: Map<string, { aggregateValue: number }> }
  > = new Map();
  tokenMock: {
    balance: number;
    transfers: Array<{ from: string; to: string; amount: number }>;
  } = { balance: 0, transfers: [] };

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      authorityContract: null,
      walletContract: "SP000000000000000000002Q6VF78",
      anonContract: "SP000000000000000000002Q6VF78",
      tokenContract: "SP000000000000000000002Q6VF78",
      rewardRate: 10,
      totalRewards: 0,
      rewardClaims: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.walletMock = new Map();
    this.anonMock = new Map();
    this.tokenMock = { balance: 0, transfers: [] };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.authorityContract !== null)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setTokenContract(contractPrincipal: string): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.tokenContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRewardRate(newRate: number): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (newRate <= 0 || newRate > 100)
      return { ok: false, value: ERR_INVALID_REWARD_RATE };
    this.state.rewardRate = newRate;
    return { ok: true, value: true };
  }

  claimReward(poolId: number, entryIndex: number): Result<number> {
    const wallet = this.walletMock.get(this.caller);
    if (!wallet?.exists) return { ok: false, value: ERR_WALLET_NOT_FOUND };
    const pool = this.anonMock.get(poolId);
    if (!pool?.exists) return { ok: false, value: ERR_POOL_NOT_FOUND };
    const entryKey = `${this.caller}-${poolId}-${entryIndex}`;
    const entry = pool.entries.get(entryKey);
    if (!entry) return { ok: false, value: ERR_NO_CONTRIBUTION };
    const claimKey = `${this.caller}-${poolId}-${entryIndex}`;
    if (this.state.rewardClaims.has(claimKey))
      return { ok: false, value: ERR_REWARD_ALREADY_CLAIMED };
    const rewardAmount = Math.floor(
      (entry.aggregateValue * this.state.rewardRate) / 100
    );
    if (rewardAmount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (this.tokenMock.balance < rewardAmount)
      return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    this.tokenMock.balance -= rewardAmount;
    this.tokenMock.transfers.push({
      from: "contract",
      to: this.caller,
      amount: rewardAmount,
    });
    this.state.rewardClaims.set(claimKey, {
      amount: rewardAmount,
      timestamp: this.blockHeight,
    });
    this.state.totalRewards += rewardAmount;
    return { ok: true, value: rewardAmount };
  }

  fundRewardPool(amount: number): Result<boolean> {
    if (!this.state.tokenContract)
      return { ok: false, value: ERR_TOKEN_CONTRACT_NOT_SET };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.tokenMock.balance += amount;
    this.tokenMock.transfers.push({
      from: this.caller,
      to: "contract",
      amount,
    });
    return { ok: true, value: true };
  }

  getRewardRate(): Result<number> {
    return { ok: true, value: this.state.rewardRate };
  }

  getTotalRewards(): Result<number> {
    return { ok: true, value: this.state.totalRewards };
  }
}

describe("RewardDistributionContract", () => {
  let contract: RewardDistributionContractMock;

  beforeEach(() => {
    contract = new RewardDistributionContractMock();
    contract.reset();
  });

  it("claims reward successfully", () => {
    contract.walletMock.set("ST1TEST", { exists: true });
    contract.anonMock.set(0, {
      exists: true,
      entries: new Map([["ST1TEST-0-0", { aggregateValue: 1000 }]]),
    });
    contract.tokenMock.balance = 1000;
    const result = contract.claimReward(0, 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(100);
    expect(contract.state.totalRewards).toBe(100);
    expect(contract.tokenMock.transfers).toEqual([
      { from: "contract", to: "ST1TEST", amount: 100 },
    ]);
  });

  it("funds reward pool successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setTokenContract("ST3TOKEN");
    const result = contract.fundRewardPool(500);
    expect(result.ok).toBe(true);
    expect(contract.tokenMock.balance).toBe(500);
    expect(contract.tokenMock.transfers).toEqual([
      { from: "ST1TEST", to: "contract", amount: 500 },
    ]);
  });

  it("sets reward rate successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setRewardRate(20);
    expect(result.ok).toBe(true);
    expect(contract.state.rewardRate).toBe(20);
  });

  it("rejects claim without wallet", () => {
    const result = contract.claimReward(0, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_WALLET_NOT_FOUND);
  });

  it("rejects claim for non-existent pool", () => {
    contract.walletMock.set("ST1TEST", { exists: true });
    const result = contract.claimReward(0, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_POOL_NOT_FOUND);
  });

  it("rejects already claimed reward", () => {
    contract.walletMock.set("ST1TEST", { exists: true });
    contract.anonMock.set(0, {
      exists: true,
      entries: new Map([["ST1TEST-0-0", { aggregateValue: 1000 }]]),
    });
    contract.tokenMock.balance = 1000;
    contract.claimReward(0, 0);
    const result = contract.claimReward(0, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_REWARD_ALREADY_CLAIMED);
  });

  it("rejects funding without token contract", () => {
    contract.state.tokenContract = "";
    const result = contract.fundRewardPool(500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TOKEN_CONTRACT_NOT_SET);
  });

  it("rejects invalid reward rate", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setRewardRate(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_REWARD_RATE);
  });

  it("gets reward rate correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setRewardRate(20);
    const result = contract.getRewardRate();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(20);
  });

  it("gets total rewards correctly", () => {
    contract.walletMock.set("ST1TEST", { exists: true });
    contract.anonMock.set(0, {
      exists: true,
      entries: new Map([["ST1TEST-0-0", { aggregateValue: 1000 }]]),
    });
    contract.tokenMock.balance = 1000;
    contract.claimReward(0, 0);
    const result = contract.getTotalRewards();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(100);
  });
});
