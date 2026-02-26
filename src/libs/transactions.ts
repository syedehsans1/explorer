/**
 * Transaction API utility functions
 * Handles fetching transactions from the new /api/v1/transactions endpoint
 * with support for filtering, sorting, and pagination
 */

export interface TransactionFilters {
  address?: string;
  addresses?: string[];
  type?: string;
  types?: string[];  // multiple types - will be fetched in parallel and merged
  status?: string;
  chain?: string;
  start_date?: string;
  end_date?: string;
  min_amount?: number;
  max_amount?: number;
  page?: number;
  limit?: number;
  sort_by?: 'timestamp' | 'amount' | 'fee' | 'block_height' | 'type' | 'status';
  sort_order?: 'asc' | 'desc';
  supplier_status?: string;
}

export interface ApiTransaction {
  id: string;
  hash: string;
  block_id: string;
  sender: string;
  recipient: string;
  amount: string;
  fee: string;
  memo: string;
  type: string;
  status: string | number;
  chain: string;
  timestamp: string;
  block_height: number;
  tx_data: any;
}

export interface TransactionsResponse {
  data: ApiTransaction[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    failedLast24h?: number;
  };
}

/**
 * Fetch transactions from the API
 * Automatically uses POST method when filtering by many addresses (>5)
 * @param filters - Filter parameters
 * @returns Promise with transactions response
 */
export async function fetchTransactions(
  filters: TransactionFilters = {}
): Promise<TransactionsResponse> {
  const {
    address,
    addresses,
    type,
    types,
    status,
    chain,
    start_date,
    end_date,
    min_amount,
    max_amount,
    page = 1,
    limit = 10,
    sort_by = 'timestamp',
    sort_order = 'desc',
  } = filters;

  // If single type in types array, treat as regular type filter
  if (types && types.length === 1) {
    return fetchTransactions({ ...filters, type: types[0], types: undefined });
  }

  // If multiple types requested, fetch in parallel and merge results
  if (types && types.length > 1) {
    const results = await Promise.all(
      types.map(t => fetchTransactions({ ...filters, type: t, types: undefined }))
    );
    // Merge all results
    const allTxs = results.flatMap(r => r.data || []);
    const totalCount = results.reduce((sum, r) => sum + (r.meta?.total || 0), 0);
    const totalPages = Math.ceil(totalCount / limit);
    const failedLast24h = results.reduce((sum, r) => sum + (r.meta?.failedLast24h || 0), 0);

    // Sort merged results
    allTxs.sort((a, b) => {
      if (sort_by === 'timestamp') {
        const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        return sort_order === 'desc' ? diff : -diff;
      }
      if (sort_by === 'block_height') {
        return sort_order === 'desc' ? b.block_height - a.block_height : a.block_height - b.block_height;
      }
      return 0;
    });

    return {
      data: allTxs.slice(0, limit),
      meta: { total: totalCount, page, limit, totalPages, failedLast24h }
    };
  }

  // Determine if we should use POST (many addresses or explicitly needed)
  const addressList = addresses || (address ? [address] : []);
  const shouldUsePost = addressList.length > 5 || addressList.length === 0;

  if (shouldUsePost) {
    // POST method - send filters in body
    const body: any = {
      page,
      limit,
      sort_by,
      sort_order,
    };

    if (addressList.length > 0) {
      body.addresses = addressList;
    }
    if (type) body.type = type;
    if (status) body.status = status;
    if (chain) body.chain = chain;
    if (start_date) body.start_date = start_date;
    if (end_date) body.end_date = end_date;
    if (min_amount !== undefined) body.min_amount = min_amount;
    if (max_amount !== undefined) body.max_amount = max_amount;

    const response = await fetch('/api/v1/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } else {
    // GET method - use query parameters
    const params = new URLSearchParams();

    if (addressList.length === 1) {
      params.append('address', addressList[0]);
    } else if (addressList.length > 1) {
      params.append('addresses', addressList.join(','));
    }
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (chain) params.append('chain', chain);
    if (start_date) params.append('start_date', start_date);
    if (end_date) params.append('end_date', end_date);
    if (min_amount !== undefined) params.append('min_amount', min_amount.toString());
    if (max_amount !== undefined) params.append('max_amount', max_amount.toString());
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('sort_by', sort_by);
    params.append('sort_order', sort_order);

    const response = await fetch(`/api/v1/transactions?${params}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }
}

/**
 * Fetch transactions with automatic fallback to node RPC if server fails
 * @param filters - Filter parameters
 * @param options - Additional options including blockchain store for RPC access
 * @returns Promise with transactions response
 */
export async function fetchTransactionsWithFallback(
  filters: TransactionFilters = {},
  options?: {
    chainStore?: any;
    baseStore?: any;
  }
): Promise<TransactionsResponse> {
  try {
    // Try server first
    return await fetchTransactions(filters);
  } catch (serverError) {
    console.warn('[Transactions Fallback] Server failed, trying node...', serverError);

    // Fallback to node RPC
    if (!options?.chainStore || !options?.baseStore) {
      console.error('[Transactions Fallback] No blockchain/base store provided for fallback');
      throw serverError;
    }

    try {
      const { decodeTxRaw } = await import('@cosmjs/proto-signing');
      const { fromBase64 } = await import('@cosmjs/encoding');
      const { hashTx } = await import('@/libs');

      const { chainStore, baseStore } = options;
      const { page = 1, limit = 25, chain = 'pocket-lego-testnet', address } = filters;

      // Wait for RPC
      let retries = 0;
      while (!chainStore.rpc && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }

      if (!chainStore.rpc) {
        throw new Error('RPC not available');
      }

      // Get latest block
      if (!baseStore.latest?.block?.header?.height) {
        const latestBlock = await chainStore.rpc.getBaseBlockLatest();
        if (latestBlock?.block?.header?.height) {
          baseStore.latest = latestBlock;
        }
      }

      const currentHeight = Number(baseStore.latest?.block?.header?.height || 0);
      if (currentHeight === 0) {
        throw new Error('No block data available');
      }

      // Fetch blocks
      const blocksToFetch = 50;
      const startBlock = Math.max(currentHeight - ((page - 1) * blocksToFetch) - blocksToFetch + 1, 1);
      const endBlock = Math.max(currentHeight - ((page - 1) * blocksToFetch), 1);

      const blockPromises = [];
      for (let height = endBlock; height >= startBlock; height--) {
        blockPromises.push(
          chainStore.rpc.getBaseBlockAt(String(height)).catch(() => null)
        );
      }

      const fetchedBlocks = await Promise.all(blockPromises);
      const allNodeTxs: ApiTransaction[] = [];

      fetchedBlocks.forEach((block: any, blockIndex: number) => {
        if (!block?.block) return;

        const height = endBlock - blockIndex;
        const blockTime = block.block.header?.time || new Date().toISOString();
        const rawTxs = block.block.data?.txs || [];

        rawTxs.forEach((txBase64: string, txIndex: number) => {
          try {
            if (!txBase64) return;

            const raw = fromBase64(txBase64);
            const txHash = hashTx(raw);
            const decodedTx = decodeTxRaw(raw);

            const messages = decodedTx.body?.messages || [];
            if (messages.length === 0) return;

            const firstMsg: any = messages[0];
            let msgType = firstMsg.typeUrl || 'Unknown';
            if (msgType.includes('.')) {
              const parts = msgType.split('.');
              msgType = parts[parts.length - 1];
            }

            const msgValue = firstMsg.value || {};
            let amount = '0';
            if (msgValue.amount && Array.isArray(msgValue.amount)) {
              amount = msgValue.amount[0]?.amount || '0';
            }

            let fee = '0';
            if (decodedTx.authInfo?.fee?.amount?.[0]?.amount) {
              fee = decodedTx.authInfo.fee.amount[0].amount;
            }

            const sender = msgValue.fromAddress || msgValue.sender || msgValue.delegatorAddress || '';
            const recipient = msgValue.toAddress || msgValue.recipient || msgValue.validatorAddress || '';

            // Filter by address if provided
            if (address && sender !== address && recipient !== address) {
              return;
            }

            allNodeTxs.push({
              id: `${height}-${txIndex}`,
              hash: txHash,
              block_id: block.block_id?.hash || '',
              block_height: parseInt(String(height)),
              status: 'success',
              amount: amount,
              type: msgType,
              fee: fee,
              timestamp: blockTime,
              sender: sender,
              recipient: recipient,
              memo: decodedTx.body?.memo || '',
              chain: chain,
              tx_data: decodedTx
            });
          } catch (err) {
            console.warn(`[Transactions Fallback] Error decoding tx:`, err);
          }
        });
      });

      // Apply pagination
      const paginatedTxs = allNodeTxs.slice(0, limit);
      const avgTxPerBlock = allNodeTxs.length / blocksToFetch || 1;
      const totalEstimate = Math.floor(currentHeight * avgTxPerBlock);

      return {
        data: paginatedTxs,
        meta: {
          total: totalEstimate,
          page: page,
          limit: limit,
          totalPages: Math.ceil(totalEstimate / limit),
          failedLast24h: 0
        }
      };
    } catch (nodeError) {
      console.error('[Transactions Fallback] Node fallback also failed:', nodeError);
      throw new Error('Both server and node are unavailable');
    }
  }
}

/**
 * Fetch transaction statistics
 * @param filters - Filter parameters (pagination and sorting ignored)
 * @returns Promise with statistics response
 */
export async function fetchTransactionStats(
  filters: Omit<TransactionFilters, 'page' | 'limit' | 'sort_by' | 'sort_order'> = {}
): Promise<any> {
  const {
    address,
    addresses,
    type,
    status,
    chain,
    start_date,
    end_date,
    min_amount,
    max_amount,
  } = filters;

  const addressList = addresses || (address ? [address] : []);
  const shouldUsePost = addressList.length > 5 || addressList.length === 0;

  if (shouldUsePost) {
    const body: any = {};

    if (addressList.length > 0) {
      body.addresses = addressList;
    }
    if (type) body.type = type;
    if (status) body.status = status;
    if (chain) body.chain = chain;
    if (start_date) body.start_date = start_date;
    if (end_date) body.end_date = end_date;
    if (min_amount !== undefined) body.min_amount = min_amount;
    if (max_amount !== undefined) body.max_amount = max_amount;

    const response = await fetch('/api/v1/transactions/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } else {
    const params = new URLSearchParams();

    if (addressList.length === 1) {
      params.append('address', addressList[0]);
    } else if (addressList.length > 1) {
      params.append('addresses', addressList.join(','));
    }
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    if (chain) params.append('chain', chain);
    if (start_date) params.append('start_date', start_date);
    if (end_date) params.append('end_date', end_date);
    if (min_amount !== undefined) params.append('min_amount', min_amount.toString());
    if (max_amount !== undefined) params.append('max_amount', max_amount.toString());

    const response = await fetch(`/api/v1/transactions/stats?${params}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }
}

