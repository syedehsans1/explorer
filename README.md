# Pocket Network Explorer

A blockchain explorer and dashboard for **Pocket Network**, forked from the Cosmos-based [ping-pub/explorer](https://github.com/ping-pub/explorer). Data is fetched from both the **indexer** (separate repository) and **Pocket RPC**, with automatic fallback to RPC when the indexer is unavailable.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

---

## Overview

Pocket Network Explorer uses **two data sources**: the **indexer** (hosted separately; see its own repository) for transaction history, proof submissions, and analytics; and **Pocket LCD/RPC** for blocks, chain state, and real-time data. When the indexer is down or unreachable, the UI automatically **falls back to RPC** so blocks and transactions can still be viewed. The frontend supports multiple Pocket chains and Pocket-specific modules (applications, suppliers, gateways, services, validators).

### What’s different from the original Cosmos explorer?

- **Pocket-only focus**: Configured for Pocket Network (mainnet, testnet, Poktroll).
- **Pocket-specific features**: Applications, suppliers, gateways, services, validators, parameters, operator lookup, and service dashboards.
- **Indexer + RPC**: Data from indexer API first, with fallback to node RPC when the indexer is unavailable. The indexer is maintained in a **separate repository**.

---

## Features

- **Dashboard** – Blocks, transactions, network stats, and charts
- **Blocks & transactions** – Browse and search via indexer API with RPC fallback
- **Validators** – List, status, and performance
- **Applications** – Pocket application accounts and usage
- **Suppliers** – Supplier (node runner) operators and metrics
- **Gateways** – Gateway operators
- **Services** – Service-level analytics and dashboards
- **Parameters** – Chain parameters (gov-style)
- **Operator lookup** – Look up operators by address or identity
- **Multi-chain** – Switch between Pocket mainnet, testnet, and Poktroll
- **Maintenance mode** – Optional maintenance page via env (e.g. `VITE_MAINTENANCE_MODE=true`)

---

## Tech stack

- **Frontend:** Vue 3, TypeScript, Vite, Vue Router, Pinia, Tailwind CSS, DaisyUI, CosmJS
- **Data sources:** Indexer API (separate repo) and Pocket LCD/RPC, with fallback from indexer to RPC

---

## Supported chains

| Chain                | Config (mainnet/testnet) | Description        |
|----------------------|--------------------------|--------------------|
| Pocket Mainnet       | `pocket-mainnet`         | Production network |
| Pocket Lego Testnet  | `pocket-lego-testnet`   | Testnet (beta)     |
| Pocket Beta (testnet)| `pocket-beta`            | Testnet            |
| Poktroll Mainnet     | `poktroll-mainnet`      | Poktroll network   |

Chain definitions live in `chains/mainnet/` and `chains/testnet/` (e.g. `chains/mainnet/pocket-lego-testnet.json`, `chains/testnet/pocket-mainnet.json`).

---

## Prerequisites

- **Node.js** 18+
- **npm** (or compatible package manager)

---

## Setup guide

### 1. Clone and install

```bash
git clone https://github.com/pokt-network/explorer.git
cd explorer
npm install
```

### 2. Frontend (explorer UI)

Run the dev server:

```bash
npm run dev
```

The app will be at `http://localhost:5173` (or the port Vite prints). By default it redirects to Pocket mainnet or testnet based on the URL (e.g. `beta` in the host/path can send you to testnet). The dev server proxies `/api` to the indexer; set the proxy target in `vite.config.ts` to your indexer base URL, or ensure the indexer is running elsewhere and the app is configured to reach it. When the indexer is unavailable, the UI falls back to RPC for blocks and transactions.

**Optional frontend env** (create `.env` in project root if needed):

```bash
# Show maintenance page instead of the app
VITE_MAINTENANCE_MODE=true
# Optional message for users
VITE_MAINTENANCE_ESTIMATED_TIME=Back in 1 hour
```

**Build for production:**

```bash
npm run build
npm run preview   # optional: preview production build
```

### 3. Indexer API

Transaction history, proof submissions, and related analytics are provided by an **indexer** maintained in a **separate repository**. Point the explorer at your indexer by configuring the `/api` proxy in `vite.config.ts` (dev) or your production API base URL. If the indexer is down, the explorer automatically falls back to Pocket RPC for blocks and transactions.

---

## NPM scripts (root)

| Script         | Description                    |
|----------------|--------------------------------|
| `npm run dev`  | Start Vite dev server          |
| `npm run build`| Type-check + production build  |
| `npm run preview` | Preview production build    |
| `npm run type-check` | Run Vue/TS type check     |

---

## Project structure

```
explorer/
├── chains/                 # Chain configs (mainnet & testnet)
│   ├── mainnet/
│   └── testnet/
├── public/                 # Static assets (e.g. logo)
├── src/
│   ├── modules/[chain]/    # Chain-scoped pages (dashboard, blocks, tx, validators, etc.)
│   ├── stores/             # Pinia stores (blockchain, base, etc.)
│   ├── libs/               # Helpers (e.g. transactions API client)
│   ├── components/
│   ├── layouts/
│   ├── pages/              # Global pages (e.g. documentation)
│   └── plugins/
├── index.html
├── vite.config.ts
├── package.json
├── PROOF_SUBMISSIONS_API.md   # Proof submissions API reference (indexer)
└── README.md                  # This file
```

---

## API documentation

The indexer (separate repo) exposes transaction and proof-submission APIs. This repo documents the contract:

- **Proof submissions & rewards analytics:** [PROOF_SUBMISSIONS_API.md](./PROOF_SUBMISSIONS_API.md)
- Other API docs: `VALIDATOR_PERFORMANCE_API.md`, `VALIDATOR_SERVICE_SEARCH_API.md`, `NETWORK_GROWTH_API.md`, etc.

---

## License

See [LICENSE](./LICENSE).
