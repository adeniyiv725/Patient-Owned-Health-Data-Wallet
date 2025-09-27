import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, stringUtf8CV, uintCV, buffCV, optionalCV, principalCV, boolCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_DATA_HASH = 101;
const ERR_INVALID_SOURCE = 102;
const ERR_INVALID_DATA_TYPE = 103;
const ERR_INVALID_DESCRIPTION = 104;
const ERR_MAX_ENTRIES_EXCEEDED = 105;
const ERR_ENTRY_NOT_FOUND = 106;
const ERR_INVALID_INDEX = 107;
const ERR_INVALID_ENCRYPTION_KEY = 108;
const ERR_WALLET_NOT_FOUND = 109;
const ERR_INVALID_CONSENT = 110;
const ERR_AUTHORITY_NOT_VERIFIED = 112;
const ERR_INVALID_MAX_ENTRIES = 113;
const ERR_INVALID_UPDATE_PARAM = 114;
const ERR_ACCESS_ALREADY_LOGGED = 115;
const ERR_INVALID_CATEGORY = 118;
const ERR_INVALID_VALUE_RANGE = 119;
const ERR_INVALID_ACCESS_LEVEL = 120;

interface Wallet {
  id: number;
  creationTimestamp: number;
  entryCount: number;
  status: boolean;
  totalDataSize: number;
}

interface DataEntry {
  dataHash: Uint8Array;
  timestamp: number;
  source: string;
  dataType: string;
  description: string;
  consent: boolean;
  encryptionKey: Uint8Array | null;
  category: string;
  valueRangeMin: number;
  valueRangeMax: number;
  accessLevel: number;
}

interface AccessLog {
  accessTimestamp: number;
  purpose: string;
  granted: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class UserWalletContractMock {
  state: {
    nextWalletId: number;
    maxWallets: number;
    maxEntriesPerWallet: number;
    authorityContract: string | null;
    userWallets: Map<string, Wallet>;
    dataEntries: Map<string, DataEntry>;
    accessLogs: Map<string, AccessLog>;
  } = {
    nextWalletId: 0,
    maxWallets: 10000,
    maxEntriesPerWallet: 500,
    authorityContract: null,
    userWallets: new Map(),
    dataEntries: new Map(),
    accessLogs: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextWalletId: 0,
      maxWallets: 10000,
      maxEntriesPerWallet: 500,
      authorityContract: null,
      userWallets: new Map(),
      dataEntries: new Map(),
      accessLogs: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxEntriesPerWallet(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_MAX_ENTRIES };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.state.maxEntriesPerWallet = newMax;
    return { ok: true, value: true };
  }

  initializeWallet(): Result<number> {
    if (this.state.userWallets.has(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const id = this.state.nextWalletId;
    this.state.userWallets.set(this.caller, {
      id,
      creationTimestamp: this.blockHeight,
      entryCount: 0,
      status: true,
      totalDataSize: 0,
    });
    this.state.nextWalletId++;
    return { ok: true, value: id };
  }

  registerData(
    dataHash: Uint8Array,
    source: string,
    dataType: string,
    description: string,
    encryptionKey: Uint8Array | null,
    category: string,
    valueRangeMin: number,
    valueRangeMax: number,
    accessLevel: number
  ): Result<number> {
    const wallet = this.state.userWallets.get(this.caller);
    if (!wallet) return { ok: false, value: ERR_WALLET_NOT_FOUND };
    if (wallet.entryCount >= this.state.maxEntriesPerWallet) return { ok: false, value: ERR_MAX_ENTRIES_EXCEEDED };
    if (dataHash.length !== 32) return { ok: false, value: ERR_INVALID_DATA_HASH };
    if (source.length === 0 || source.length > 50) return { ok: false, value: ERR_INVALID_SOURCE };
    if (!["fitness", "vitals", "sleep"].includes(dataType)) return { ok: false, value: ERR_INVALID_DATA_TYPE };
    if (description.length > 200) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (encryptionKey && encryptionKey.length !== 64) return { ok: false, value: ERR_INVALID_ENCRYPTION_KEY };
    if (category.length > 30) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (valueRangeMin > valueRangeMax) return { ok: false, value: ERR_INVALID_VALUE_RANGE };
    if (accessLevel > 3) return { ok: false, value: ERR_INVALID_ACCESS_LEVEL };
    const index = wallet.entryCount;
    const key = `${this.caller}-${index}`;
    this.state.dataEntries.set(key, {
      dataHash,
      timestamp: this.blockHeight,
      source,
      dataType,
      description,
      consent: false,
      encryptionKey,
      category,
      valueRangeMin,
      valueRangeMax,
      accessLevel,
    });
    wallet.entryCount++;
    wallet.totalDataSize++;
    return { ok: true, value: index };
  }

  updateConsent(index: number, consent: boolean): Result<boolean> {
    const wallet = this.state.userWallets.get(this.caller);
    if (!wallet) return { ok: false, value: ERR_WALLET_NOT_FOUND };
    if (index >= wallet.entryCount) return { ok: false, value: ERR_INVALID_INDEX };
    const key = `${this.caller}-${index}`;
    const entry = this.state.dataEntries.get(key);
    if (!entry) return { ok: false, value: ERR_ENTRY_NOT_FOUND };
    entry.consent = consent;
    return { ok: true, value: true };
  }

  logAccess(entryIndex: number, accessor: string, purpose: string, granted: boolean): Result<boolean> {
    const wallet = this.state.userWallets.get(this.caller);
    if (!wallet) return { ok: false, value: ERR_WALLET_NOT_FOUND };
    if (entryIndex >= wallet.entryCount) return { ok: false, value: ERR_INVALID_INDEX };
    const entryKey = `${this.caller}-${entryIndex}`;
    if (!this.state.dataEntries.has(entryKey)) return { ok: false, value: ERR_ENTRY_NOT_FOUND };
    const logKey = `${this.caller}-${entryIndex}-${accessor}`;
    if (this.state.accessLogs.has(logKey)) return { ok: false, value: ERR_ACCESS_ALREADY_LOGGED };
    this.state.accessLogs.set(logKey, {
      accessTimestamp: this.blockHeight,
      purpose,
      granted,
    });
    return { ok: true, value: true };
  }

  deleteEntry(index: number): Result<boolean> {
    const wallet = this.state.userWallets.get(this.caller);
    if (!wallet) return { ok: false, value: ERR_WALLET_NOT_FOUND };
    if (index >= wallet.entryCount) return { ok: false, value: ERR_INVALID_INDEX };
    const key = `${this.caller}-${index}`;
    this.state.dataEntries.delete(key);
    wallet.entryCount--;
    wallet.totalDataSize--;
    return { ok: true, value: true };
  }

  getEntryCount(user: string): Result<number> {
    const wallet = this.state.userWallets.get(user);
    if (!wallet) return { ok: false, value: ERR_WALLET_NOT_FOUND };
    return { ok: true, value: wallet.entryCount };
  }

  isEntryConsented(user: string, index: number): Result<boolean> {
    const key = `${user}-${index}`;
    const entry = this.state.dataEntries.get(key);
    if (!entry) return { ok: false, value: ERR_ENTRY_NOT_FOUND };
    return { ok: true, value: entry.consent };
  }
}

describe("UserWalletContract", () => {
  let contract: UserWalletContractMock;

  beforeEach(() => {
    contract = new UserWalletContractMock();
    contract.reset();
  });

  it("initializes wallet successfully", () => {
    const result = contract.initializeWallet();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const wallet = contract.state.userWallets.get("ST1TEST");
    expect(wallet?.id).toBe(0);
    expect(wallet?.entryCount).toBe(0);
  });

  it("registers data successfully", () => {
    contract.initializeWallet();
    const dataHash = new Uint8Array(32).fill(1);
    const result = contract.registerData(dataHash, "Fitbit", "fitness", "Daily steps", null, "activity", 0, 10000, 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const key = "ST1TEST-0";
    const entry = contract.state.dataEntries.get(key);
    expect(entry?.source).toBe("Fitbit");
    expect(entry?.dataType).toBe("fitness");
    expect(entry?.consent).toBe(false);
  });

  it("updates consent successfully", () => {
    contract.initializeWallet();
    const dataHash = new Uint8Array(32).fill(1);
    contract.registerData(dataHash, "Fitbit", "fitness", "Daily steps", null, "activity", 0, 10000, 1);
    const result = contract.updateConsent(0, true);
    expect(result.ok).toBe(true);
    const key = "ST1TEST-0";
    const entry = contract.state.dataEntries.get(key);
    expect(entry?.consent).toBe(true);
  });

  it("logs access successfully", () => {
    contract.initializeWallet();
    const dataHash = new Uint8Array(32).fill(1);
    contract.registerData(dataHash, "Fitbit", "fitness", "Daily steps", null, "activity", 0, 10000, 1);
    const result = contract.logAccess(0, "ST2RESEARCH", "AI training", true);
    expect(result.ok).toBe(true);
    const logKey = "ST1TEST-0-ST2RESEARCH";
    const log = contract.state.accessLogs.get(logKey);
    expect(log?.granted).toBe(true);
    expect(log?.purpose).toBe("AI training");
  });

  it("deletes entry successfully", () => {
    contract.initializeWallet();
    const dataHash = new Uint8Array(32).fill(1);
    contract.registerData(dataHash, "Fitbit", "fitness", "Daily steps", null, "activity", 0, 10000, 1);
    const result = contract.deleteEntry(0);
    expect(result.ok).toBe(true);
    const wallet = contract.state.userWallets.get("ST1TEST");
    expect(wallet?.entryCount).toBe(0);
    const key = "ST1TEST-0";
    expect(contract.state.dataEntries.has(key)).toBe(false);
  });

  it("gets entry count correctly", () => {
    contract.initializeWallet();
    const dataHash = new Uint8Array(32).fill(1);
    contract.registerData(dataHash, "Fitbit", "fitness", "Daily steps", null, "activity", 0, 10000, 1);
    const result = contract.getEntryCount("ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });

  it("checks if entry is consented correctly", () => {
    contract.initializeWallet();
    const dataHash = new Uint8Array(32).fill(1);
    contract.registerData(dataHash, "Fitbit", "fitness", "Daily steps", null, "activity", 0, 10000, 1);
    contract.updateConsent(0, true);
    const result = contract.isEntryConsented("ST1TEST", 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects registration with invalid data hash", () => {
    contract.initializeWallet();
    const dataHash = new Uint8Array(31).fill(1);
    const result = contract.registerData(dataHash, "Fitbit", "fitness", "Daily steps", null, "activity", 0, 10000, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DATA_HASH);
  });

  it("rejects registration without wallet", () => {
    const dataHash = new Uint8Array(32).fill(1);
    const result = contract.registerData(dataHash, "Fitbit", "fitness", "Daily steps", null, "activity", 0, 10000, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_WALLET_NOT_FOUND);
  });

  it("rejects max entries exceeded", () => {
    contract.initializeWallet();
    contract.state.maxEntriesPerWallet = 1;
    const dataHash = new Uint8Array(32).fill(1);
    contract.registerData(dataHash, "Fitbit", "fitness", "Daily steps", null, "activity", 0, 10000, 1);
    const result = contract.registerData(dataHash, "Apple", "vitals", "Heart rate", null, "health", 60, 100, 2);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ENTRIES_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets max entries per wallet successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMaxEntriesPerWallet(1000);
    expect(result.ok).toBe(true);
    expect(contract.state.maxEntriesPerWallet).toBe(1000);
  });

  it("rejects max entries change without authority", () => {
    const result = contract.setMaxEntriesPerWallet(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });
});