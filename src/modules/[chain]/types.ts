export interface ApiBlockItem {
  id: string;
  height: number;
  hash: string;
  timestamp: string;
  block_production_time?: number;
  production_time?: number;
  block_time?: number;
  proposer: string;
  chain: string;
  transaction_count?: number;
}

export interface ChainStatus {
  chain: string;
  historical_checkpoint: number;
  monitoring_height: number;
  latest_height: number;
  monitor_lag: number;
  historical_backlog: number;
  total_backlog: number;
  status: {
    monitoring: string;
    historical: string;
    overall: string;
  };
}

export interface IndexerHealth {
  chains: ChainStatus[];
}

export interface NetworkStats {
  wallets: number;
  applications: number;
  gateways: number;
  suppliers: number;
  services: number;
}
