# MNEE CLI

MNEE CLI is a command-line interface tool designed for interacting with MNEE USD.

## QA-Testing Guide

**Core Features:**

- Set active wallet
- Balance query
- Token transfers
- Transaction status check
- Transaction history retrieval

## Test organization
```
qa-test/
├── balance.test.ts - Balance query with test cases
├── transfer.test.ts - Transfer the amount and check the transaction status with different test cases
├── History.test.ts - query transaction history with multiple test cases.
```
### Prerequisites

1. Build the package locally: `npm run build`

### Run individual tests

```bash
node --test qa-test/balance.test.ts
```
```bash
node --test qa-test/transfer.test.ts
```
```bash
node --test qa-test/history.test.ts
```

### Run all tests

```bash
npm test
```