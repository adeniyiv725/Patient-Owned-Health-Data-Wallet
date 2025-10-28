import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, buffCV, principalCV, boolCV, contractPrincipalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 200;
const ERR_WALLET_NOT_FOUND = 201;
const ERR_ENTRY_NOT_FOUND = 202;
const ERR_NO_CONSENT = 203;
const ERR_INVALID_POOL_ID = 204;
const ERR_INVALID_DATA_HASH = 205;
const ERR_INVALID_CATEGORY = 206;
const ERR_MAX_POOLS_EXCEEDED = 210;
const ERR_INVALID_DATA_TYPE = 211;
const ERR_AUTHORITY_NOT_VERIFIED = 212;
const ERR_INVALID_AGGREGATE = 213;
const ERR_INVALID_VALUE_RANGE = 214;

interface Pool {
  category: string;
  dataType: string;
  entryCount: number;
  totalValue: number;
  minValue: number;
  maxValue: number;
}

interface AnonEntry {
  anonHash: Uint8Array;
  timestamp: number;
  aggregateValue: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AnonymizationContractMock {
  state: {
    nextPoolId: number;
    maxPools: number;
    authorityContract: string | null;
    walletContract: string;
    dataPools: Map<number, Pool>;
    anonymizedEntries: Map<string, AnonEntry>;
  } = {
    nextPoolId: 0,
    maxPools: 1000,
    authorityContract: null,
    walletContract: "SP000000000000000000002Q6VF78",
    dataPools: new Map(),
    anonymizedEntries: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  walletMock: {
    wallets: Map<string, { entryCount: number }>;
    entries: Map<string, { dataType: string; category: string; consent: boolean }>;
  } = { wallets: new Map(), entries: new Map() };

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextPoolId: 0,
      maxPools: 1000,
      authorityContract: null,
      walletContract: "SP000000000000000000002Q6VF78",
      dataPools: new Map(),
      anonymizedEntries: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.walletMock.wallets = new Map();
    this.walletMock.entries = new Map();
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.authorityContract !== null) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setWalletContract(contractPrincipal: string): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.walletContract = contractPrincipal;
    return { ok: true, value: true };
  }

  createPool(category: string, dataType: string, minValue: number, maxValue: number): Result<number> {
    if (this.state.nextPoolId >= this.state.maxPools) return { ok: false, value: ERR_MAX_POOLS_EXCEEDED };
    if (category.length > 30) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (!["fitness", "vitals", "sleep"].includes(dataType)) return { ok: false, value: ERR_INVALID_DATA_TYPE };
    if (minValue > maxValue) return { ok: false, value: ERR_INVALID_VALUE_RANGE };
    const poolId = this.state.nextPoolId;
    this.state.dataPools.set(poolId, { category, dataType, entryCount: 0, totalValue: 0, minValue, maxValue });
    this.state.nextPoolId++;
    return { ok: true, value: poolId };
  }

  anonymizeAndSubmit(entryIndex: number, poolId: number, anonHash: Uint8Array, aggregateValue: number): Result<boolean> {
    if (poolId >= this.state.nextPoolId) return { ok: false, value: ERR_INVALID_POOL_ID };
    if (anonHash.length !== 32) return { ok: false, value: ERR_INVALID_DATA_HASH };
    const pool = this.state.dataPools.get(poolId);
    if (!pool) return { ok: false, value: ERR_POOL_NOT_FOUND };
    if (aggregateValue < pool.minValue || aggregateValue > pool.maxValue) return { ok: false, value: ERR_INVALID_AGGREGATE };
    const wallet = this.walletMock.wallets.get(this.caller);
    if (!wallet) return { ok: false, value: ERR_WALLET_NOT_FOUND };
    const entryKey = `${this.caller}-${entryIndex}`;
    const entry = this.walletMock.entries.get(entryKey);
    if (!entry) return { ok: false, value: ERR_ENTRY_NOT_FOUND };
    if (!entry.consent) return { ok: false, value: ERR_NO_CONSENT };
    if (entry.dataType !== pool.dataType || entry.category !== pool.category) return { ok: false, value: ERR_INVALID_DATA_TYPE };
    const anonKey = `${this.caller}-${poolId}-${entryIndex}`;
    this.state.anonymizedEntries.set(anonKey, { anonHash, timestamp: this.blockHeight, aggregateValue });
    pool.entryCount++;
    pool.totalValue += aggregateValue;
    return { ok: true, value: true };
  }

  removeFromPool(poolId: number, entryIndex: number): Result<boolean> {
    if (poolId >= this.state.nextPoolId) return { ok: false, value: ERR_INVALID_POOL_ID };
    const pool = this.state.dataPools.get(poolId);
    if (!pool) return { ok: false, value: ERR_POOL_NOT_FOUND };
    const anonKey = `${this.caller}-${poolId}-${entryIndex}`;
    const entry = this.state.anonymizedEntries.get(anonKey);
    if (!entry) return { ok: false, value: ERR_ENTRY_NOT_FOUND };
    pool.entryCount--;
    pool.totalValue -= entry.aggregateValue;
    this.state.anonymizedEntries.delete(anonKey);
    return { ok: true, value: true };
  }

  getPoolCount(): Result<number> {
    return { ok: true, value: this.state.nextPoolId };
  }
}

describe("AnonymizationContract", () => {
  let contract: AnonymizationContractMock;

  beforeEach(() => {
    contract = new AnonymizationContractMock();
    contract.reset();
  });

  it("creates pool successfully", () => {
    const result = contract.createPool("activity", "fitness", 0, 10000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const pool = contract.state.dataPools.get(0);
    expect(pool?.category).toBe("activity");
    expect(pool?.dataType).toBe("fitness");
    expect(pool?.entryCount).toBe(0);
  });

  it("anonymizes and submits data successfully", () => {
    contract.createPool("activity", "fitness", 0, 10000);
    contract.walletMock.wallets.set("ST1TEST", { entryCount: 1 });
    contract.walletMock.entries.set("ST1TEST-0", { dataType: "fitness", category: "activity", consent: true });
    const anonHash = new Uint8Array(32).fill(1);
    const result = contract.anonymizeAndSubmit(0, 0, anonHash, 5000);
    expect(result.ok).toBe(true);
    const entry = contract.state.anonymizedEntries.get("ST1TEST-0-0");
    expect(entry?.aggregateValue).toBe(5000);
    const pool = contract.state.dataPools.get(0);
    expect(pool?.entryCount).toBe(1);
    expect(pool?.totalValue).toBe(5000);
  });

  it("removes entry from pool successfully", () => {
    contract.createPool("activity", "fitness", 0, 10000);
    contract.walletMock.wallets.set("ST1TEST", { entryCount: 1 });
    contract.walletMock.entries.set("ST1TEST-0", { dataType: "fitness", category: "activity", consent: true });
    const anonHash = new Uint8Array(32).fill(1);
    contract.anonymizeAndSubmit(0, 0, anonHash, 5000);
    const result = contract.removeFromPool(0, 0);
    expect(result.ok).toBe(true);
    expect(contract.state.anonymizedEntries.has("ST1TEST-0-0")).toBe(false);
    const pool = contract.state.dataPools.get(0);
    expect(pool?.entryCount).toBe(0);
    expect(pool?.totalValue).toBe(0);
  });

  it("rejects submission without consent", () => {
    contract.createPool("activity", "fitness", 0, 10000);
    contract.walletMock.wallets.set("ST1TEST", { entryCount: 1 });
    contract.walletMock.entries.set("ST1TEST-0", { dataType: "fitness", category: "activity", consent: false });
    const anonHash = new Uint8Array(32).fill(1);
    const result = contract.anonymizeAndSubmit(0, 0, anonHash, 5000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NO_CONSENT);
  });

  it("rejects invalid pool ID", () => {
    contract.walletMock.wallets.set("ST1TEST", { entryCount: 1 });
    contract.walletMock.entries.set("ST1TEST-0", { dataType: "fitness", category: "activity", consent: true });
    const anonHash = new Uint8Array(32).fill(1);
    const result = contract.anonymizeAndSubmit(0, 1, anonHash, 5000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_POOL_ID);
  });

  it("rejects invalid data hash", () => {
    contract.createPool("activity", "fitness", 0, 10000);
    contract.walletMock.wallets.set("ST1TEST", { entryCount: 1 });
    contract.walletMock.entries.set("ST1TEST-0", { dataType: "fitness", category: "activity", consent: true });
    const anonHash = new Uint8Array(31).fill(1);
    const result = contract.anonymizeAndSubmit(0, 0, anonHash, 5000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DATA_HASH);
  });

  it("rejects max pools exceeded", () => {
    contract.state.maxPools = 1;
    contract.createPool("activity", "fitness", 0, 10000);
    const result = contract.createPool("health", "vitals", 60, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_POOLS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("sets wallet contract successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setWalletContract("ST3WALLET");
    expect(result.ok).toBe(true);
    expect(contract.state.walletContract).toBe("ST3WALLET");
  });

  it("gets pool count correctly", () => {
    contract.createPool("activity", "fitness", 0, 10000);
    contract.createPool("health", "vitals", 60, 100);
    const result = contract.getPoolCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
});