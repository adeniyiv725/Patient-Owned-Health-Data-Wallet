# 🩺 Patient-Owned Health Data Wallet

Welcome to a revolutionary Web3 solution for empowering patients with control over their health data! This project creates a decentralized health data wallet on the Stacks blockchain using Clarity smart contracts. Users can securely store, manage, and monetize their health data from wearables, while contributing anonymized data to AI training datasets in exchange for token rewards. It solves real-world problems like data privacy breaches in centralized health systems, lack of patient incentives for data sharing, and inefficient data aggregation for medical research and AI development.

## ✨ Features

🔒 Patient-owned data storage with encryption and access controls  
📱 Seamless integration with wearables (e.g., Fitbit, Apple Health) via oracle-verified data feeds  
💰 Token rewards for contributing anonymized data to AI training pools  
🤖 Anonymized data pooling for ethical AI model training by researchers  
🔍 Verifiable data provenance and audit trails on the blockchain  
🛡️ Privacy-preserving sharing with granular consent management  
📈 Governance for token holders to vote on data usage policies  
🚫 Prevention of unauthorized data access or duplication

## 🛠 How It Works

This project leverages 8 Clarity smart contracts to handle data ownership, tokenomics, anonymization, and AI contributions securely on the Stacks blockchain. Data from wearables is hashed and stored on-chain for provenance, while actual sensitive data remains off-chain (e.g., IPFS or encrypted storage) with references. Users earn custom fungible tokens (e.g., HEALTH tokens) for opting into data sharing.

### Key Smart Contracts

1. **UserWalletContract**: Manages individual patient wallets for storing health data hashes, metadata (e.g., timestamps, device sources), and consent settings. Users register their wallet and update data entries.  
2. **TokenContract**: Implements a SIP-10 compliant fungible token for rewards (HEALTH tokens). Handles minting, burning, and transfers.  
3. **WearableOracleContract**: Acts as an oracle to verify and ingest data from wearables. It validates signatures from trusted APIs (e.g., Fitbit OAuth) and timestamps incoming health metrics like steps, heart rate, or sleep data.  
4. **AnonymizationContract**: Processes user-submitted data to generate anonymized versions (e.g., via hashing personal identifiers or aggregating stats). Ensures data is stripped of PII before pooling.  
5. **DataPoolContract**: Aggregates anonymized data contributions into shared pools categorized by type (e.g., fitness, vitals). Researchers can query pool metadata without accessing raw data directly.  
6. **RewardDistributionContract**: Calculates and distributes HEALTH tokens based on data contribution volume, quality, and pool demand. Uses formulas like rewards = (data_size * utility_score) / total_contributions.  
7. **AccessControlContract**: Enforces granular permissions for data access. Users set consents (e.g., "share anonymized vitals with AI firms"), and it logs all access attempts immutably.  
8. **GovernanceContract**: Allows HEALTH token holders to propose and vote on updates, such as reward rates, new data types, or partnerships with AI entities.

### For Patients (Users)

- Connect your wearable device via the app/frontend.  
- Call `UserWalletContract::register-data` with a hash of your health metrics (e.g., JSON from Fitbit API).  
- Opt-in to sharing by invoking `AnonymizationContract::anonymize-and-submit`, which processes your data and sends it to `DataPoolContract`.  
- Earn rewards automatically via `RewardDistributionContract::claim-rewards`—get HEALTH tokens proportional to your contribution's value for AI training.  
- Manage consents anytime with `AccessControlContract::update-consent` to revoke or grant access.

Boom! You now own and profit from your health data without Big Tech intermediaries.

### For Researchers/AI Developers

- Browse available data pools using `DataPoolContract::get-pool-stats` to see anonymized aggregates (e.g., average heart rates by age group).  
- Request access to specific datasets by staking HEALTH tokens or paying fees, verified by `AccessControlContract::grant-research-access`.  
- Use the data for AI training ethically, with all transactions logged for transparency.  
- Participate in governance via `GovernanceContract::vote-proposal` to influence data policies.

### For Verifiers/Auditors

- Query `UserWalletContract::get-data-details` or `AccessControlContract::verify-access-log` to confirm ownership, timestamps, and compliance.  
- Use `DataPoolContract::verify-contribution` to check the integrity of pooled data without revealing sources.

This setup ensures HIPAA-like privacy in a decentralized way, incentivizes data sharing for better AI-driven healthcare (e.g., predictive models for diseases), and puts control back in patients' hands. Deploy on Stacks for low-cost, Bitcoin-secured transactions!