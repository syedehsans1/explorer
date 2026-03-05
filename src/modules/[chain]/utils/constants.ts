export const CHAIN_MAP: Record<string, string> = {
  'pocket-lego-testnet': 'pocket-lego-testnet',
  'pocket-mainnet': 'pocket-mainnet',
};

export const TX_TYPE_LABELS: Record<string, string> = {
  'MsgSend (bank)': 'Send',
  'MsgEditValidator (node)': 'EditValidator',
  'MsgSubmitProof (proof)': 'SubmitProof',
  'MsgCreateClaim (proof)': 'CreateClaim',
};

export const CACHE_EXPIRATION_MS = 60_000;

export function getApiChainName(chainName: string): string {
  return CHAIN_MAP[chainName] || chainName || 'pocket-lego-testnet';
}
