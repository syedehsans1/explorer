<script lang="ts" setup>
import {
  useBlockchain,
  useFormatter,
  useStakingStore,
  useTxDialog,
  useCoingecko,
  useBaseStore,
} from '@/stores';
import DynamicComponent from '@/components/dynamic/DynamicComponent.vue';
import DonutChart from '@/components/charts/DonutChart.vue';
import ApexCharts from 'vue3-apexcharts';
import { RouterLink } from 'vue-router';
import { computed, ref } from '@vue/reactivity';
import { onMounted, watch, onUnmounted, watchEffect } from 'vue';
import { Icon } from '@iconify/vue';
import { useSEO } from '@/composables/useSEO';

import type {
  AuthAccount,
  Delegation,
  TxResponse,
  DelegatorRewards,
  UnbondingResponses,
  Application,
  Gateway,
  Supplier,
} from '@/types';
import type { Coin } from '@cosmjs/amino';
import Countdown from '@/components/Countdown.vue';
import { fromBase64 } from '@cosmjs/encoding';
import { useClipboard } from '@vueuse/core'
import { fetchTransactions, fetchTransactionsWithFallback, type ApiTransaction, type TransactionFilters } from '@/libs/transactions';

const props = defineProps(['address', 'chain']);

const source = ref(props.address)
const { copy, copied } = useClipboard({ source })

const blockchain = useBlockchain();
const stakingStore = useStakingStore();
const dialog = useTxDialog();
const format = useFormatter();
const coingecko = useCoingecko();
const base = useBaseStore();
const account = ref({} as AuthAccount);
const applications = ref({} as Application);
const gateways = ref({} as Gateway);
const suppliers = ref({} as Supplier);
const txs = ref<ApiTransaction[]>([]);
const delegations = ref([] as Delegation[]);
const rewards = ref({} as DelegatorRewards);
const balances = ref([] as Coin[]);
const unbonding = ref([] as UnbondingResponses[]);
const unbondingTotal = ref(0);
const chart = {};
// Cancellation token to avoid updating state from stale requests
let activeLoadToken = 0;

// Transaction filter state
const currentTxPage = ref(1);
const txItemsPerPage = ref(25);
const totalTxPages = ref(0);
const totalTxCount = ref(0);
const loadingTxs = ref(false);
const selectedTypeTab = ref<'all' | 'send' | 'claim' | 'proof' | 'governance' | 'staking'>('all');
const txStatusFilter = ref<string>('');
const txStartDate = ref<string>('');
const txEndDate = ref<string>('');
const txMinAmount = ref<number | undefined>(undefined);
const txMaxAmount = ref<number | undefined>(undefined);
const txSortBy = ref<'timestamp' | 'amount' | 'fee' | 'block_height' | 'type' | 'status'>('timestamp');
const txSortOrder = ref<'asc' | 'desc'>('desc');
const showAdvancedTxFilters = ref(false);

// Map frontend chain names to API chain names
const getApiChainName = (chainName: string) => {
  const chainMap: Record<string, string> = {
    'pocket-lego-testnet': 'pocket-lego-testnet',
    'pocket-mainnet': 'pocket-mainnet'
  };
  return chainMap[chainName] || chainName || 'pocket-lego-testnet';
};

// Type tab mappings
const typeTabMap: Record<string, string[]> = {
  all: [],
  send: ['MsgSend (bank)', 'MsgMultiSend (bank)'],
  claim: ['MsgCreateClaim (proof)'],
  proof: ['MsgSubmitProof (proof)'],
  governance: [
    'MsgSubmitProposal (governance)',
    'MsgVote (governance)',
    'MsgDeposit (governance)',
    'MsgVoteWeighted (governance)'
  ],
  staking: [
    'MsgDelegate (node)',
    'MsgUndelegate (node)',
    'MsgBeginRedelegate (node)',
    'MsgStakeApplication (application)',
    'MsgUnstakeApplication (application)',
    'MsgStakeSupplier (supplier)',
    'MsgUnstakeSupplier (supplier)',
    'MsgStakeGateway (gateway)',
    'MsgUnstakeGateway (gateway)'
  ]
};

let txDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function resetAccountState() {
  account.value = {} as AuthAccount
  applications.value = {} as Application
  gateways.value = {} as Gateway
  suppliers.value = {} as Supplier
  txs.value = []
  rewards.value = {} as DelegatorRewards
  balances.value = [] as Coin[]
  delegations.value = [] as Delegation[]
  unbonding.value = [] as UnbondingResponses[]
  unbondingTotal.value = 0
  performanceRows.value = []
  performanceType.value = 'unknown'
  loadingPerformance.value = false
  performanceError.value = ''
  currentTxPage.value = 1
  totalTxPages.value = 0
  totalTxCount.value = 0
}

// Get POKT coingecko_id from blockchain config
const poktCoingeckoId = computed(() => {
  const poktAsset = blockchain.current?.assets?.find(
    (a: any) => a.base === 'upokt' || a.base?.toLowerCase() === 'upokt'
  );
  return poktAsset?.coingecko_id || 'pocket-network';
});

// SEO Meta Tags
const chainName = computed(() => blockchain.current?.chainName || props.chain || 'Pocket Network');
const accountTitle = computed(() => {
  const shortAddress = props.address ? `${props.address.substring(0, 12)}...${props.address.substring(props.address.length - 6)}` : 'Account';
  return `Account ${shortAddress} - ${chainName.value}`;
});
const accountDescription = computed(() => {
  const balance = balances.value.find(b => b.denom === 'upokt');
  const formattedBalance = balance ? format.formatTokenAmount(balance) : '0';
  return `View account ${props.address?.substring(0, 16)}... on ${chainName.value}. Balance: ${formattedBalance} POKT. View account details, transactions, delegations, and staking information on Pocket Network Explorer.`;
});
watchEffect(() => {
  if (props.address) {
    useSEO({
      title: accountTitle.value,
      description: accountDescription.value,
      keywords: `${chainName.value}, account ${props.address}, wallet address, account balance, blockchain account, account details`,
    });
  }
});

// Fetch POKT price
async function loadPoktPrice() {
  const coinId = poktCoingeckoId.value;
  if (coinId) {
    try {
      await coingecko.fetchCoinPrice([coinId]);
    } catch (error) {
      console.error('Error fetching POKT price:', error);
    }
  }
}

async function loadAll(address: string) {
  // Increment token to invalidate any in-flight requests from previous address
  const token = ++activeLoadToken
  resetAccountState()
  // Fire in parallel; each callee checks the token before mutating state
  void loadAccount(address)
  void loadAddressPerformance(address)
  void loadPoktPrice()
}

onMounted(() => {
  loadAll(props.address)
});

onUnmounted(() => {
  // Invalidate any pending updates when component is destroyed
  activeLoadToken++
})

// Add watcher for address prop
watch(
  () => props.address,
  (newAddress: string, oldAddress: string) => {
    if (newAddress !== oldAddress) {
      // Do not await to avoid blocking transitions
      loadAll(newAddress)
    }
  }
);

const totalAmountByCategory = computed(() => {
  let sumDel = 0;
  delegations.value?.forEach((x) => {
    sumDel += Number(x.balance.amount);
  });
  let sumRew = 0;
  rewards.value?.total?.forEach((x) => {
    sumRew += Number(x.amount);
  });
  let sumBal = 0;
  balances.value?.forEach((x) => {
    sumBal += Number(x.amount);
  });
  let sumUn = 0;
  unbonding.value?.forEach((x) => {
    x.entries?.forEach((y) => {
      sumUn += Number(y.balance);
    });
  });
  return [sumBal, sumDel];
});

const labels = ['Balance', 'Staking'];

const totalAmount = computed(() => {
  return totalAmountByCategory.value.reduce((p, c) => c + p, 0);
});

const donutData = computed(() => {
  // Define colors: #09279F for Available, #FFB206 for Staked, #9E9E9E for MACT (grey/unusable)
  const availableColor = '#09279F';
  const stakedColor = '#FFB206';
  const mactColor = '#9E9E9E'; // Grey for unusable MACT
  
  // Each balance - check if it's MACT
  const balanceSlices = balances.value.map(b => {
    const denom = b.denom.toUpperCase();
    const isMACT = denom.includes('MACT');
    return {
      label: denom.replace('U', ''),
      amount: format.tokenDisplayNumber(b),
      color: isMACT ? mactColor : availableColor,
      type: 'balance',
      isMACT: isMACT,
      balanceItem: b
    };
  });
  // Each delegation
  const delegationSlices = delegations.value.map((d, i) => {
    const stakeType = (d as any).stakeType || 'delegation';
    const typeLabels: Record<string, string> = {
      'supplier': 'Supplier Stake',
      'application': 'Application Stake',
      'gateway': 'Gateway Stake',
      'delegation': 'Delegation'
    };
    return {
      label: stakeType === 'delegation' ? `Staking #${i + 1}` : typeLabels[stakeType],
      amount: format.tokenDisplayNumber(d.balance),
      color: stakedColor,
      type: 'delegation',
      stakeType: stakeType,
      isMACT: false,
      delegationItem: d
    };
  });
  // Optionally, add rewards as slices too
  // const rewardSlices = rewards.value?.total?.map((r, i) => ({
  //   label: `Reward #${i + 1}`,
  //   amount: format.tokenDisplayNumber(r)
  // })) || [];
  return [...balanceSlices, ...delegationSlices /*, ...rewardSlices*/];
});

// USD Value Computed Properties
const poktPrice = computed(() => {
  const coinId = poktCoingeckoId.value;
  if (!coinId || !coingecko.prices[coinId]) {
    return null;
  }
  const priceData = coingecko.prices[coinId];
  return priceData.usd ? parseFloat(priceData.usd) : null;
});

// Helper function to get USD value for a token amount (in base units)
function getUsdValue(amount: string | number, denom: string): string {
  // Only calculate USD for POKT tokens (skip MACT and others)
  const denomUpper = String(denom).toUpperCase();
  if (denomUpper.includes('MACT') || !denomUpper.includes('POKT')) {
    return '';
  }
  
  const price = poktPrice.value;
  if (!price || !amount) {
    return '';
  }
  
  // Convert from base units (upokt) to display units (POKT)
  const amountInPokt = Number(amount) / Math.pow(10, 6);
  const usdValue = amountInPokt * price;
  
  // Format with commas and 2 decimal places
  if (usdValue < 0.01) {
    return `$${usdValue.toFixed(4)}`;
  }
  return `$${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Total USD value of the portfolio
const totalUsdValue = computed(() => {
  const price = poktPrice.value;
  if (!price) {
    return null;
  }
  
  let total = 0;
  
  // Sum all POKT balances
  balances.value.forEach((balance) => {
    const denomUpper = balance.denom.toUpperCase();
    if (!denomUpper.includes('MACT') && denomUpper.includes('POKT')) {
      const amountInPokt = Number(balance.amount) / Math.pow(10, 6);
      total += amountInPokt * price;
    }
  });
  
  // Sum all POKT delegations/stakes
  delegations.value.forEach((delegation) => {
    if (delegation.balance?.amount && delegation.balance?.denom) {
      const denomUpper = delegation.balance.denom.toUpperCase();
      if (denomUpper.includes('POKT')) {
        const amountInPokt = Number(delegation.balance.amount) / Math.pow(10, 6);
        total += amountInPokt * price;
      }
    }
  });
  
  return total;
});

async function loadAccount(address: string) {
  blockchain.rpc.getAuthAccount(address).then((x) => {
    account.value = x.account;
  });
  
  // Load transactions using new API
  void loadTransactions(address);
  
  blockchain.rpc.getDistributionDelegatorRewards(address).then((x) => {
    rewards.value = x;
  });
  blockchain.rpc.getStakingDelegations(address).then((x) => {
    const regularDelegations = x.delegation_responses || []

    // Check if address is a supplier, application, or gateway
    // Priority: supplier > application > gateway > regular delegations
    blockchain.rpc.getSuppliersInfo(address).then((supplierData) => {
      suppliers.value = supplierData.supplier
      if (supplierData.supplier?.stake) {
        // If supplier, only show supplier stake, not regular delegations
        // @ts-expect-error because delegation is being reused as stake information container
        delegations.value = [{ balance: supplierData.supplier.stake, stakeType: 'supplier' }]
      } else {
        // Not a supplier, check application
        return blockchain.rpc.getApplicationsInfo(address).then((appData) => {
          applications.value = appData.application
          if (appData.application?.stake) {
            // If application, only show application stake
            // @ts-expect-error because delegation is being reused as stake information container
            delegations.value = [{ balance: appData.application.stake, stakeType: 'application' }]
          } else {
            // Not an application, check gateway
            return blockchain.rpc.getGatewaysInfo(address).then((gatewayData) => {
              gateways.value = gatewayData.gateways
              if (gatewayData.gateway?.stake) {
                // If gateway, only show gateway stake
                // @ts-expect-error because delegation is being reused as stake information container
                delegations.value = [{ balance: gatewayData.gateway.stake, stakeType: 'gateway' }]
              } else {
                // Not a gateway either, use regular delegations
                delegations.value = regularDelegations.map(d => ({ ...d, stakeType: 'delegation' }))
              }
            }).catch(() => {
              // Gateway check failed, use regular delegations
              delegations.value = regularDelegations.map(d => ({ ...d, stakeType: 'delegation' }))
            })
          }
        }).catch(() => {
          // Application check failed, try gateway
          return blockchain.rpc.getGatewaysInfo(address).then((gatewayData) => {
            gateways.value = gatewayData.gateways
            if (gatewayData.gateway?.stake) {
              // @ts-expect-error because delegation is being reused as stake information container
              delegations.value = [{ balance: gatewayData.gateway.stake, stakeType: 'gateway' }]
            } else {
              delegations.value = regularDelegations.map(d => ({ ...d, stakeType: 'delegation' }))
            }
          }).catch(() => {
            delegations.value = regularDelegations.map(d => ({ ...d, stakeType: 'delegation' }))
          })
        })
      }
    }).catch(() => {
      // Supplier check failed, try application
      blockchain.rpc.getApplicationsInfo(address).then((appData) => {
        applications.value = appData.application
        if (appData.application?.stake) {
          // @ts-expect-error because delegation is being reused as stake information container
          delegations.value = [{ balance: appData.application.stake, stakeType: 'application' }]
        } else {
          // Try gateway
          return blockchain.rpc.getGatewaysInfo(address).then((gatewayData) => {
            gateways.value = gatewayData.gateways
            if (gatewayData.gateway?.stake) {
              // @ts-expect-error because delegation is being reused as stake information container
              delegations.value = [{ balance: gatewayData.gateway.stake, stakeType: 'gateway' }]
            } else {
              delegations.value = regularDelegations.map(d => ({ ...d, stakeType: 'delegation' }))
            }
          }).catch(() => {
            delegations.value = regularDelegations.map(d => ({ ...d, stakeType: 'delegation' }))
          })
        }
      }).catch(() => {
        // Try gateway
        blockchain.rpc.getGatewaysInfo(address).then((gatewayData) => {
          gateways.value = gatewayData.gateways
          if (gatewayData.gateway?.stake) {
            // @ts-expect-error because delegation is being reused as stake information container
            delegations.value = [{ balance: gatewayData.gateway.stake, stakeType: 'gateway' }]
          } else {
            delegations.value = regularDelegations.map(d => ({ ...d, stakeType: 'delegation' }))
          }
        }).catch(() => {
          delegations.value = regularDelegations.map(d => ({ ...d, stakeType: 'delegation' }))
        })
      })
    }).finally(() => {
      console.error("No info found for address: ", address)
    })
  });
  blockchain.rpc.getBankBalances(address).then((x) => {
    x.balances.forEach((y) => {
      if (y.denom != 'upokt') {
        y.denom = y.denom.toUpperCase();
      }
    });
    balances.value = x.balances;
  });
  blockchain.rpc.getStakingDelegatorUnbonding(address).then((x) => {
    unbonding.value = x.unbonding_responses;
    x.unbonding_responses?.forEach((y) => {
      y.entries.forEach((z) => {
        unbondingTotal.value += Number(z.balance);
      });
    });
  });
}

async function loadTransactions(address: string) {
  loadingTxs.value = true;
  try {
    const apiChainName = getApiChainName(props.chain || blockchain.current?.chainName || 'pocket-beta');
    const filters: TransactionFilters = {
      address,
      chain: apiChainName,
      page: currentTxPage.value,
      limit: txItemsPerPage.value,
      sort_by: txSortBy.value,
      sort_order: txSortOrder.value,
    };

    // Add type filter based on selected tab
    const selectedTypes = typeTabMap[selectedTypeTab.value];
    if (selectedTypes.length > 0) {
      // if the account is an application, add the MsgStakeApplication type
      if (selectedTypeTab.value === 'staking') {
        if (applications.value.address === address) {
          filters.type = 'MsgStakeApplication (application)';
        } else if (gateways.value.address === address) {
          filters.type = 'MsgStakeGateway (gateway)';
        } else if (suppliers.value.operator_address === address) {
          filters.type = 'MsgStakeSupplier (supplier)';
        }
      } else {
        filters.type = selectedTypes[0];
      }
    }

    if (txStatusFilter.value) {
      filters.status = txStatusFilter.value == 'success' ? "true" : "false";
    }
    if (txStartDate.value) {
      // Convert datetime-local to ISO 8601
      filters.start_date = new Date(txStartDate.value).toISOString();
    }
    if (txEndDate.value) {
      // Convert datetime-local to ISO 8601
      filters.end_date = new Date(txEndDate.value).toISOString();
    }
    if (txMinAmount.value !== undefined) {
      filters.min_amount = txMinAmount.value;
    }
    if (txMaxAmount.value !== undefined) {
      filters.max_amount = txMaxAmount.value;
    }

    const data = await fetchTransactionsWithFallback(filters, {
      chainStore: blockchain,
      baseStore: base
    });
    txs.value = data.data || [];
    totalTxCount.value = data.meta?.total || 0;
    totalTxPages.value = data.meta?.totalPages || 0;
  } catch (error) {
    console.error('Error loading transactions:', error);
    txs.value = [];
    totalTxCount.value = 0;
    totalTxPages.value = 0;
  } finally {
    loadingTxs.value = false;
  }
}

function debouncedLoadTransactions(address: string) {
  if (txDebounceTimer) {
    clearTimeout(txDebounceTimer);
  }
  txDebounceTimer = setTimeout(() => {
    currentTxPage.value = 1;
    loadTransactions(address);
  }, 300);
}

// Watch for filter changes
watch([selectedTypeTab, txStatusFilter, txStartDate, txEndDate, txMinAmount, txMaxAmount, txSortBy, txSortOrder], () => {
  if (props.address) {
    debouncedLoadTransactions(props.address);
  }
});

watch([currentTxPage, txItemsPerPage], () => {
  if (props.address) {
    loadTransactions(props.address);
  }
});

function updateEvent() {
  loadAccount(props.address);
}

function mapAmount(events: { type: string, attributes: { key: string, value: string }[] }[]) {
  if (!events) return []
  return events.find(x => x.type === 'coin_received')?.attributes
    .filter(x => x.key === 'YW1vdW50' || x.key === `amount`)
    .map(x => x.key === 'amount' ? x.value : String.fromCharCode(...fromBase64(x.value)))
}

// Performance/Usage analytics (Supplier or Application)
type PerformanceRow = {
  day_bucket: string
  total_rewards_upokt: number
  total_relays: number
  avg_efficiency_percent: number
  unique_services?: number
  unique_applications?: number  // For suppliers: number of unique applications served
  unique_suppliers?: number     // For applications: number of unique suppliers
  total_submissions?: number
  avg_reward_per_relay?: number
  total_claimed_compute_units?: number
  total_estimated_compute_units?: number
}

const performanceType = ref<'supplier' | 'application' | 'unknown'>('unknown')
const performanceRows = ref<PerformanceRow[]>([])
const loadingPerformance = ref(false)
const performanceError = ref('')

// Chart data
const rewardsChartSeries = ref([{ name: 'Total Rewards', data: [] as number[] }]);
const relaysChartSeries = ref([{ name: 'Total Relays', data: [] as number[] }]);

const rewardsChartType = ref<'bar' | 'area' | 'line'>('area');
const relaysChartType = ref<'bar' | 'area' | 'line'>('line');
const rewardsChartCategories = ref<string[]>([]);
const relaysChartCategories = ref<string[]>([]);

const rewardsChartOptions = computed(() => {
  const chartType = rewardsChartType.value;
  
  const strokeConfig = chartType === 'bar' 
    ? { width: 0 }
    : {
        curve: chartType === 'area' ? 'smooth' : 'straight',
        width: 2
      };
  
  const fillConfig = chartType === 'bar'
    ? { opacity: 1, type: 'solid' }
    : {
        type: chartType === 'area' ? 'gradient' : 'solid',
        opacity: chartType === 'area' ? 0.3 : 0,
        gradient: chartType === 'area' ? {
          shadeIntensity: 1,
          opacityFrom: 0.7,
          opacityTo: 0.3,
          stops: [0, 90, 100]
        } : undefined
      };

  return {
    chart: { type: chartType, height: 280, toolbar: { show: false }, zoom: { enabled: false } },
    colors: ['#A3E635'],
    dataLabels: { enabled: false },
    stroke: strokeConfig,
    fill: fillConfig,
    grid: { borderColor: 'rgba(255, 255, 255, 0.1)', row: { colors: ['transparent'], opacity: 0.5 } },
    markers: chartType === 'bar' ? { size: 0 } : chartType === 'line' ? {
      size: 4,
      strokeWidth: 0,
      hover: { size: 6 }
    } : { size: 0, hover: { size: 4 } },
    xaxis: { categories: rewardsChartCategories.value, labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45, rotateAlways: false } },
    yaxis: { 
      labels: { 
        style: { colors: 'rgb(116, 109, 105)' }, 
        formatter: (v: number) => {
          if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
          if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
          return v.toFixed(2);
        }
      } 
    },
    tooltip: { theme: 'dark', y: { formatter: (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' POKT' } }
  };
});

const relaysChartOptions = computed(() => {
  const chartType = relaysChartType.value;
  
  const strokeConfig = chartType === 'bar' 
    ? { width: 0 }
    : {
        curve: chartType === 'area' ? 'smooth' : 'straight',
        width: 2
      };
  
  const fillConfig = chartType === 'bar'
    ? { opacity: 1, type: 'solid' }
    : {
        type: chartType === 'area' ? 'gradient' : 'solid',
        opacity: chartType === 'area' ? 0.3 : 0,
        gradient: chartType === 'area' ? {
          shadeIntensity: 1,
          opacityFrom: 0.7,
          opacityTo: 0.3,
          stops: [0, 90, 100]
        } : undefined
      };

  return {
    chart: { type: chartType, height: 280, toolbar: { show: false }, zoom: { enabled: false } },
    colors: ['#5E9AE4'],
    dataLabels: { enabled: false },
    stroke: strokeConfig,
    fill: fillConfig,
    grid: { borderColor: 'rgba(255, 255, 255, 0.1)', row: { colors: ['transparent'], opacity: 0.5 } },
    markers: chartType === 'bar' ? { size: 0 } : chartType === 'line' ? {
      size: 4,
      strokeWidth: 0,
      hover: { size: 6 }
    } : { size: 0, hover: { size: 4 } },
    xaxis: { categories: relaysChartCategories.value, labels: { style: { colors: 'rgb(116, 109, 105)' }, rotate: -45, rotateAlways: false } },
    yaxis: { labels: { style: { colors: 'rgb(116, 109, 105)' }, formatter: (v: number) => (v / 1000).toFixed(0) + 'K' } },
    tooltip: { theme: 'dark', y: { formatter: (v: number) => v.toLocaleString() + ' relays' } }
  };
});

// Summary metrics
const summaryMetrics = computed(() => {
  if (performanceRows.value.length === 0) return null;
  const totalRewards = performanceRows.value.reduce((sum, r) => sum + r.total_rewards_upokt, 0);
  const totalRelays = performanceRows.value.reduce((sum, r) => sum + r.total_relays, 0);
  const totalSubmissions = performanceRows.value.reduce((sum, r) => sum + (r.total_submissions || 0), 0);
  const avgEfficiency = performanceRows.value.reduce((sum, r) => sum + r.avg_efficiency_percent, 0) / performanceRows.value.length;

  // For suppliers: show unique_applications, for applications: show unique_suppliers
  const uniqueApplications = performanceType.value === 'supplier'
    ? Math.max(...performanceRows.value.map(r => r.unique_applications || 0))
    : undefined;
  const uniqueSuppliers = performanceType.value === 'application'
    ? Math.max(...performanceRows.value.map(r => r.unique_suppliers || 0))
    : undefined;
  const uniqueServices = Math.max(...performanceRows.value.map(r => r.unique_services || 0));

  return {
    totalRewards,
    totalRelays,
    totalSubmissions,
    avgEfficiency,
    uniqueApplications,
    uniqueSuppliers,
    uniqueServices
  };
});

function updateCharts() {
  const sorted = [...performanceRows.value].sort((a, b) =>
    new Date(a.day_bucket).getTime() - new Date(b.day_bucket).getTime()
  );

  const labels = sorted.map(d => {
    const date = new Date(d.day_bucket);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  rewardsChartSeries.value = [{ name: 'Total Rewards (POKT)', data: sorted.map(d => d.total_rewards_upokt / 1000000) }];
  relaysChartSeries.value = [{ name: 'Total Relays', data: sorted.map(d => d.total_relays) }];

  rewardsChartCategories.value = labels;
  relaysChartCategories.value = labels;
}

function formatNumber(num: number | string): string {
  return new Intl.NumberFormat().format(typeof num === 'string' ? parseInt(num) : num);
}

// Flatten supplier services data into table rows
interface ServiceTableRow {
  serviceId: string
  jsonRpcUrl: string
  websocketUrl: string
  revenueShareAddress: string
  revenueSharePercentage: string
}

const supplierServiceRows = computed(() => {
  if (!suppliers.value?.services) return []
  const rows: ServiceTableRow[] = []

  suppliers.value.services.forEach((service: any) => {
    // Extract JSON_RPC and WEBSOCKET URLs
    let jsonRpcUrl = ''
    let websocketUrl = ''

    service.endpoints?.forEach((endpoint: any) => {
      if (endpoint.rpc_type === 'JSON_RPC') {
        jsonRpcUrl = endpoint.url || ''
      } else if (endpoint.rpc_type === 'WEBSOCKET') {
        websocketUrl = endpoint.url || ''
      }
    })

    // Create one row per revenue share
    if (service.rev_share && service.rev_share.length > 0) {
      service.rev_share.forEach((share: any) => {
        rows.push({
          serviceId: service.service_id,
          jsonRpcUrl,
          websocketUrl,
          revenueShareAddress: share.address || '',
          revenueSharePercentage: share.rev_share_percentage || '0'
        })
      })
    } else {
      // Even if no revenue share, show the service
      rows.push({
        serviceId: service.service_id,
        jsonRpcUrl,
        websocketUrl,
        revenueShareAddress: '',
        revenueSharePercentage: '0'
      })
    }
  })

  return rows
})

function getServiceRowSpan(serviceId: string): number {
  return supplierServiceRows.value.filter(r => r.serviceId === serviceId).length
}

// Grouped services with all revenue share addresses
interface GroupedServiceRow {
  serviceId: string
  jsonRpcUrl: string
  websocketUrl: string
  revenueShares: Array<{ address: string; percentage: string }>
}

const groupedSupplierServices = computed(() => {
  if (!suppliers.value?.services) return []
  const grouped: GroupedServiceRow[] = []

  suppliers.value.services.forEach((service: any) => {
    // Extract JSON_RPC and WEBSOCKET URLs
    let jsonRpcUrl = ''
    let websocketUrl = ''

    service.endpoints?.forEach((endpoint: any) => {
      if (endpoint.rpc_type === 'JSON_RPC') {
        jsonRpcUrl = endpoint.url || ''
      } else if (endpoint.rpc_type === 'WEBSOCKET') {
        websocketUrl = endpoint.url || ''
      }
    })

    // Collect all revenue shares
    const revenueShares: Array<{ address: string; percentage: string }> = []
    if (service.rev_share && service.rev_share.length > 0) {
      service.rev_share.forEach((share: any) => {
        revenueShares.push({
          address: share.address || '',
          percentage: share.rev_share_percentage || '0'
        })
      })
    }

    grouped.push({
      serviceId: service.service_id,
      jsonRpcUrl,
      websocketUrl,
      revenueShares
    })
  })

  return grouped
})

// Track expanded services
const expandedServices = ref<Set<string>>(new Set())

function toggleServiceExpansion(serviceId: string) {
  if (expandedServices.value.has(serviceId)) {
    expandedServices.value.delete(serviceId)
  } else {
    expandedServices.value.add(serviceId)
  }
}

function isServiceExpanded(serviceId: string): boolean {
  return expandedServices.value.has(serviceId)
}

function formatAddress(address: string, maxLength: number = 20): string {
  if (!address) return ''
  return address.length > maxLength ? address.substring(0, maxLength - 3) + '...' : address
}

async function fetchJson(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`status ${res.status}`)
  return res.json()
}

async function loadAddressPerformance(address: string) {
  loadingPerformance.value = true
  performanceError.value = ''
  performanceRows.value = []
  performanceType.value = 'unknown'
  try {
    // Try supplier performance first
    try {
      const data = await fetchJson(`/api/v1/suppliers/${address}/performance?limit=30`)
      const rows = (data?.data || []) as any[]
      if (rows.length > 0) {
        performanceType.value = 'supplier'
        performanceRows.value = rows.map(r => ({
          day_bucket: r.day_bucket,
          total_rewards_upokt: Number(r.total_rewards_upokt || 0),
          total_relays: Number(r.total_relays || 0),
          avg_efficiency_percent: Number(r.avg_efficiency_percent || 0),
          unique_applications: Number(r.unique_applications || 0),
          unique_services: Number(r.unique_services || 0),
          total_submissions: Number(r.total_submissions || 0),
          avg_reward_per_relay: Number(r.avg_reward_per_relay || 0),
          total_claimed_compute_units: Number(r.total_claimed_compute_units || 0),
          total_estimated_compute_units: Number(r.total_estimated_compute_units || 0)
        })).sort((a, b) => new Date(b.day_bucket).getTime() - new Date(a.day_bucket).getTime())
        return
      }
    } catch (e) {
      // fall through to application
    }

    // Fallback: application usage
    try {
      const data = await fetchJson(`/api/v1/applications/${address}/usage?limit=30`)
      const rows = (data?.data || []) as any[]
      if (rows.length > 0) {
        performanceType.value = 'application'
        performanceRows.value = rows.map(r => ({
          day_bucket: r.day_bucket,
          total_rewards_upokt: Number(r.total_rewards_upokt || 0),
          total_relays: Number(r.total_relays || 0),
          avg_efficiency_percent: Number(r.avg_efficiency_percent || 0),
          unique_services: Number(r.unique_services || 0),
          unique_suppliers: Number(r.unique_suppliers || 0),
          total_submissions: Number(r.total_submissions || 0),
          avg_reward_per_relay: Number(r.avg_reward_per_relay || 0),
          total_claimed_compute_units: Number(r.total_claimed_compute_units || 0),
          total_estimated_compute_units: Number(r.total_estimated_compute_units || 0)
        })).sort((a, b) => new Date(b.day_bucket).getTime() - new Date(a.day_bucket).getTime())
        return
      }
    } catch (e) {
      // give up
    }
  } catch (err: any) {
    performanceError.value = String(err?.message || err)
  } finally {
    loadingPerformance.value = false
    if (performanceRows.value.length > 0) {
      updateCharts()
    }
  }
}
</script>
<template>
<div class="pt-[6.5rem]">
  <div v-if="account">
      <!-- address -->
      <div class="bg-[#ffffff] hover:bg-base-200 text-2xl w-full px-4 py-4 my-4 font-bold text-[#000000] dark:text-[#ffffff] rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="flex items-center">
          <!-- content -->
          <div class="flex items-center flex-1 space-x-3">
            <h2 class="text-2xl card-title">{{ $t('account.address') }}</h2>
            <span class="text-[16px] truncate flex items-center" style="width:max-content"> {{ address }} {{ "&nbsp;&nbsp;&nbsp;" }}
              <span class="float-right cursor-pointer" style="width:max-content" v-if="copied">&nbsp;&nbsp;Copied!</span>
              <Icon class="float-right cursor-pointer" icon="ic:round-content-copy" @click="copy(address)" />
            </span>
          </div>
        </div>
      </div>

    <!-- <div class="bg-base-100 dark:bg-[#00125b] pt-2"> -->
    <!-- Laptop View -->
    <div class="desktop-address flex flex-1 overflow-auto gap-8 mb-4">
      <!-- Assets and Performance Summary -->
      <div class="flex flex-row overflow-auto gap-8 w-full">
        <div class="bg-base-200 mb-4 rounded-xl hover:bg-base-300 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] shadow-md bg-gradient-to-b border border-[#FFB206] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
          <div class="flex justify-between text-main mb-4 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] bg-base-200  px-4 py-2 w-full">
            <h2 class="text-2xl font-semibold text-[#171C1F] dark:text-[#ffffff;]">{{ $t('account.assets') }}</h2>
            <div v-if="totalUsdValue !== null" class="flex items-center">
              <span class="text-sm text-[#64748B] dark:text-gray-400 mr-2">Total Portfolio Value:</span>
              <span class="text-lg font-bold text-[#171C1F] dark:text-[#ffffff]">
                ${{ totalUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              </span>
            </div>
          </div>
          <div class="grid md:!grid-cols-3 bg-[#ffffff] dark:bg-[rgba(255,255,255,.03)]">
            <div class="md:!col-span-1">
              <DonutChart 
                :series="donutData.filter(x => !x.isMACT).map(x => x.amount)" 
                :labels="donutData.filter(x => !x.isMACT).map(x => x.label)"
                :colors="donutData.filter(x => !x.isMACT).map(x => x.color)"
              />
            </div>
            <div class="md:!col-span-2 md:!mt-0 overflow-scroll">
              <!-- list-->
              <div class="">
                <!--balances  -->
                <div class="flex flex-row overflow-auto">
                  <div class="flex flex-col items-start">
                    <h2 class="text-[#64748B] text-sm px-4 mb-2 mt-10">Status</h2>
                    <div class="flex flex-col items-start px-4 mb-2 gap-4">
                      <!-- Items from donutData to match order and colors -->
                      <div v-for="(item, index) in donutData" :key="`item-${index}`"
                        class="flex items-center justify-start text-sm font-semibold whitespace-nowrap gap-1">
                        <span 
                          class="w-3 h-3 inline-block rounded-sm"
                          :style="{ backgroundColor: item.color }"
                        ></span>
                        <span :class="{ 'text-gray-400': item.isMACT }">
                          {{ item.type === 'balance' 
                            ? (item.isMACT ? 'MACT (Unusable)' : 'Available') 
                            : ((item as any).stakeType === 'supplier' ? 'Supplier Stake' 
                              : (item as any).stakeType === 'application' ? 'Application Stake'
                              : (item as any).stakeType === 'gateway' ? 'Gateway Stake'
                              : 'Delegation') }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col">
                    <h2 class="text-[#64748B;] text-sm px-4 mb-2 mt-10">Amount</h2>
                    <div class="flex flex-col items-start px-4 mb-2 gap-4">
                      <!-- Items from donutData to match order -->
                      <div v-for="(item, index) in donutData" :key="`item-${index}`"
                        class="text-sm font-semibold whitespace-nowrap"
                        :class="{ 'text-gray-400': item.isMACT }">
                        {{ item.type === 'balance' ? format.formatToken((item as any).balanceItem) : format.formatToken((item as any).delegationItem?.balance) }}
                        <span v-if="!item.isMACT && (item.type === 'balance' ? getUsdValue((item as any).balanceItem?.amount, (item as any).balanceItem?.denom) : getUsdValue((item as any).delegationItem?.balance?.amount, (item as any).delegationItem?.balance?.denom))"
                          class="text-xs text-gray-500 dark:text-gray-400 ml-1">
                          ({{ item.type === 'balance' ? getUsdValue((item as any).balanceItem?.amount, (item as any).balanceItem?.denom) : getUsdValue((item as any).delegationItem?.balance?.amount, (item as any).delegationItem?.balance?.denom) }})
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col">
                    <h2 class="text-[#64748B;] text-sm px-4 mb-2 mt-10">Percentage</h2>
                    <div class="flex flex-col items-start px-4 mb-2 gap-4">
                      <!-- Items from donutData to match order -->
                      <div v-for="(item, index) in donutData" :key="`item-${index}`"
                        class="text-sm font-semibold whitespace-nowrap"
                        :class="{ 'text-gray-400': item.isMACT }">
                        {{ item.type === 'balance' 
                          ? format.calculatePercent((item as any).balanceItem.amount, totalAmount) 
                          : format.calculatePercent((item as any).delegationItem?.balance?.amount, totalAmount) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Summary Cards (next to Assets) -->
        <div class="flex-1 flex flex-col">
          <div v-if="performanceType !== 'unknown' && summaryMetrics"
            class="flex justify-between text-main mb-4 px-4 py-2 w-full">
            <h3 class="text-lg card-title">
              {{ performanceType === 'supplier' ? 'Performance Summary' : 'Usage Summary' }}
            </h3>

            <span class="bg-[#ffffff] hover:bg-base-200 px-3 py-1 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              Last {{ performanceRows.length }} days
            </span>
          </div>
          <div v-if="performanceType !== 'unknown' && summaryMetrics" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#A3E635] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:currency-usd" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Total Rewards</div>
                </div>
                <div class="text-xl font-bold">{{ format.formatToken({
                  denom: 'upokt', amount:
                    String(summaryMetrics.totalRewards) }) }}</div>
              </div>
            </div>
            <div class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#5E9AE4] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:network" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Total Relays</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.totalRelays) }}</div>
              </div>
            </div>
            <div class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#FFB206] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:percent" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Avg Efficiency</div>
                </div>
                <div class="text-xl font-bold">{{ summaryMetrics.avgEfficiency.toFixed(2) }}%</div>
              </div>
            </div>
            <div class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#60BC29] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:file-document-multiple" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Total Submissions</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.totalSubmissions) }}</div>
              </div>
            </div>
            <div v-if="performanceType === 'supplier' && summaryMetrics.uniqueApplications"
              class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#09279F] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:apps" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Max Applications/Day</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.uniqueApplications) }}</div>
              </div>
            </div>
            <div v-if="performanceType === 'application' && summaryMetrics.uniqueSuppliers"
              class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#09279F] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:account-group" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Max Suppliers/Day</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.uniqueSuppliers) }}</div>
              </div>
            </div>
            <div v-if="summaryMetrics.uniqueServices" class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#A3E635] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:handshake" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Unique Services</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.uniqueServices) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Mobile / Tablet view -->
    <div class="mobile-address flex flex-col gap-4 w-full lg:hidden">
      <!-- Assets -->
      <div class="w-full">
        <div class="bg-base-200 mb-4 rounded-xl hover:bg-base-300 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] shadow-md bg-gradient-to-b border border-[#FFB206] dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
          <div class="flex flex-col sm:flex-row justify-between text-main mb-4 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] bg-base-200 px-4 py-2 w-full">
            <h2 class="text-2xl font-semibold text-[#171C1F] dark:text-[#ffffff;]">{{ $t('account.assets') }}</h2>
            <div v-if="totalUsdValue !== null" class="flex items-center mt-2 sm:mt-0">
              <span class="text-sm text-[#64748B] dark:text-gray-400 mr-2">Total Portfolio Value:</span>
              <span class="text-lg font-bold text-[#171C1F] dark:text-[#ffffff]">
                ${{ totalUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              </span>
            </div>
          </div>
          <div class="grid md:!grid-cols-3 bg-[#ffffff] dark:bg-[rgba(255,255,255,.03)]">
            <div class="md:!col-span-1">
              <DonutChart 
                :series="donutData.filter(x => !x.isMACT).map(x => x.amount)" 
                :labels="donutData.filter(x => !x.isMACT).map(x => x.label)"
                :colors="donutData.filter(x => !x.isMACT).map(x => x.color)"
              />
            </div>
            <div class="md:!col-span-2 md:!mt-0 overflow-scroll">
              <!-- list-->
              <div class="">
                <!--balances  -->
                <div class="flex flex-row overflow-auto">
                  <div class="flex flex-col items-start">
                    <h2 class="text-[#64748B] text-sm px-4 mb-2 mt-10">Status</h2>
                    <div class="flex flex-col items-start px-4 mb-2 gap-4">
                      <!-- Items from donutData to match order and colors -->
                      <div v-for="(item, index) in donutData" :key="`item-${index}`"
                        class="flex items-center justify-start text-sm font-semibold whitespace-nowrap gap-1">
                        <span 
                          class="w-3 h-3 inline-block rounded-sm"
                          :style="{ backgroundColor: item.color }"
                        ></span>
                        <span :class="{ 'text-gray-400': item.isMACT }">
                          {{ item.type === 'balance' 
                            ? (item.isMACT ? 'MACT (Unusable)' : 'Available') 
                            : ((item as any).stakeType === 'supplier' ? 'Supplier Stake' 
                              : (item as any).stakeType === 'application' ? 'Application Stake'
                              : (item as any).stakeType === 'gateway' ? 'Gateway Stake'
                              : 'Delegation') }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col">
                    <h2 class="text-[#64748B;] text-sm px-4 mb-2 mt-10">Amount</h2>
                    <div class="flex flex-col items-start px-4 mb-2 gap-4">
                      <!-- Items from donutData to match order -->
                      <div v-for="(item, index) in donutData" :key="`item-${index}`"
                        class="text-sm font-semibold whitespace-nowrap"
                        :class="{ 'text-gray-400': item.isMACT }">
                        {{ item.type === 'balance' ? format.formatToken((item as any).balanceItem) : format.formatToken((item as any).delegationItem?.balance) }}
                        <span v-if="!item.isMACT && (item.type === 'balance' ? getUsdValue((item as any).balanceItem?.amount, (item as any).balanceItem?.denom) : getUsdValue((item as any).delegationItem?.balance?.amount, (item as any).delegationItem?.balance?.denom))"
                          class="text-xs text-gray-500 dark:text-gray-400 ml-1">
                          ({{ item.type === 'balance' ? getUsdValue((item as any).balanceItem?.amount, (item as any).balanceItem?.denom) : getUsdValue((item as any).delegationItem?.balance?.amount, (item as any).delegationItem?.balance?.denom) }})
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col">
                    <h2 class="text-[#64748B;] text-sm px-4 mb-2 mt-10">Percentage</h2>
                    <div class="flex flex-col items-start px-4 mb-2 gap-4">
                      <!-- Items from donutData to match order -->
                      <div v-for="(item, index) in donutData" :key="`item-${index}`"
                        class="text-xs font-semibold"
                        :class="{ 'text-gray-400': item.isMACT }">
                        {{ item.type === 'balance' 
                          ? format.calculatePercent((item as any).balanceItem.amount, totalAmount) 
                          : format.calculatePercent((item as any).delegationItem?.balance?.amount, totalAmount) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- Performance Summary Cards (next to Assets) -->
        <div class="flex-1 flex flex-col">
          <div v-if="performanceType !== 'unknown' && summaryMetrics"
            class="flex justify-between text-main mb-4 px-4 py-2 w-full">
            <h3 class="text-lg card-title">
              {{ performanceType === 'supplier' ? 'Performance Summary' : 'Usage Summary' }}
            </h3>

            <span class="text-xs text-secondary bg-base-200 dark:bg-base-300 px-3 py-1 rounded-full shadow-md hover:shadow-lg transition-shadow duration-300">
              Last {{ performanceRows.length }} days
            </span>
          </div>
          <div v-if="performanceType !== 'unknown' && summaryMetrics" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#A3E635] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:currency-usd" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Total Rewards</div>
                </div>
                <div class="text-xl font-bold">{{ format.formatToken({
                  denom: 'upokt', amount:
                    String(summaryMetrics.totalRewards) }) }}</div>
              </div>
            </div>
            <div class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#5E9AE4] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:network" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Total Relays</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.totalRelays) }}</div>
              </div>
            </div>
            <div class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#FFB206] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:percent" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Avg Efficiency</div>
                </div>
                <div class="text-xl font-bold">{{ summaryMetrics.avgEfficiency.toFixed(2) }}%</div>
              </div>
            </div>
            <div class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#60BC29] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:file-document-multiple" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Total Submissions</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.totalSubmissions) }}</div>
              </div>
            </div>
            <div v-if="performanceType === 'supplier' && summaryMetrics.uniqueApplications"
              class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#09279F] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:apps" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Max Applications/Day</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.uniqueApplications) }}</div>
              </div>
            </div>
            <div v-if="performanceType === 'application' && summaryMetrics.uniqueSuppliers"
              class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#09279F] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:account-group" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Max Suppliers/Day</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.uniqueSuppliers) }}</div>
              </div>
            </div>
            <div v-if="summaryMetrics.uniqueServices" class="bg-[#ffffff] hover:bg-base-200 p-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 dark:bg-base-200 bg-[#A3E635] rounded-lg flex items-center justify-center">
                    <Icon icon="mdi:handshake" class="text-lg text-white" />
                  </div>
                  <div class="text-sm text-secondary">Unique Services</div>
                </div>
                <div class="text-xl font-bold">{{ formatNumber(summaryMetrics.uniqueServices) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Services Table (for Suppliers) -->
    <div v-if="suppliers.services?.length > 0" class="mb-4 mt-4">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl card-title">
          Services ({{ suppliers.services?.length }})
        </h2>
      </div>
      <div class="bg-base-200 px-0.5 pt-0.5 pb-0.5 rounded-xl hover:bg-base-300 shadow-md bg-gradient-to-b dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
        <div class="services-table-wrapper services-table-scroll rounded-xl">
          <table class="table table-compact w-full">
            <thead class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 sticky top-0 border-0">
              <tr class="border-b-[0px] text-sm font-semibold">
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 hover:bg-base-300">Service ID</th>
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 hover:bg-base-300">JSON_RPC URL</th>
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 hover:bg-base-300">WEBSOCKET URL</th>
                <th class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 hover:bg-base-300">Revenue Share Addresses</th>
              </tr>
            </thead>
            <tbody class="bg-[#ffffff] dark:bg-[rgba(255,255,255,.03)] relative">
              <template v-for="service in groupedSupplierServices" :key="service.serviceId">
                <tr class="dark:hover:bg-[rgba(255,255,255,0.06)] hover:bg-base-200 transition-colors rounded-xl duration-200 border-b-[0px]">
                  <td class="align-top font-medium">
                    {{ service.serviceId }}
                  </td>
                  <td class="align-top">
                    <a v-if="service.jsonRpcUrl" :href="service.jsonRpcUrl" target="_blank"
                      class="text-[#09279F] dark:text-warning hover:underline font-mono text-xs"
                      :title="service.jsonRpcUrl">
                      {{ service.jsonRpcUrl }}
                    </a>
                    <span v-else class="text-xs text-gray-500">-</span>
                  </td>
                  <td class="align-top">
                    <a v-if="service.websocketUrl" :href="service.websocketUrl" target="_blank"
                      class="text-[#09279F] dark:text-warning hover:underline font-mono text-xs"
                      :title="service.websocketUrl">
                      {{ service.websocketUrl }}
                    </a>
                    <span v-else class="text-xs text-gray-500">-</span>
                  </td>
                  <td class="align-top">
                    <div v-if="service.revenueShares.length > 0" class="space-y-1">
                      <!-- Truncated view (first 1 address) -->
                      <template v-if="!isServiceExpanded(service.serviceId)">
                        <div v-for="(share, idx) in service.revenueShares.slice(0, 1)" :key="idx" class="flex items-center gap-2">
                          <RouterLink :to="`/${chain}/account/${share.address}`"
                            class="dark:text-warning text-[#153cd8] hover:underline font-mono text-xs"
                            :title="share.address">
                            {{ formatAddress(share.address) }}
                          </RouterLink>
                          <span class="text-xs text-gray-500">({{ share.percentage }}%)</span>
                          <div v-if="service.revenueShares.length > 1" class="flex items-center gap-2">
                          <button
                            @click="toggleServiceExpansion(service.serviceId)"
                            class="text-xs text-[#09279F] dark:text-warning hover:underline flex items-center gap-1">
                            <Icon icon="mdi:chevron-down" class="text-sm" />
                            +{{ service.revenueShares.length - 1 }} more
                          </button>
                        </div>
                        </div>
                        <!-- <div v-if="service.revenueShares.length > 1" class="flex items-center gap-2">
                          <button
                            @click="toggleServiceExpansion(service.serviceId)"
                            class="text-xs text-[#09279F] dark:text-warning hover:underline flex items-center gap-1">
                            <Icon icon="mdi:chevron-down" class="text-sm" />
                            +{{ service.revenueShares.length - 1 }} more
                          </button>
                        </div> -->
                      </template>
                      <!-- Expanded view (all addresses) -->
                      <template v-else>
                        <div v-for="(share, idx) in service.revenueShares" :key="idx" class="flex items-center gap-2">
                          <RouterLink :to="`/${chain}/account/${share.address}`"
                            class="dark:text-warning text-[#153cd8] hover:underline font-mono text-xs"
                            :title="share.address">
                            {{ formatAddress(share.address) }}
                          </RouterLink>
                          <span class="text-xs text-gray-500">({{ share.percentage }}%)</span>
                        </div>
                        <button
                          @click="toggleServiceExpansion(service.serviceId)"
                          class="text-xs text-[#09279F] dark:text-warning hover:underline flex items-center gap-1 mt-1">
                          <Icon icon="mdi:chevron-up" class="text-sm" />
                          Show less
                        </button>
                      </template>
                    </div>
                    <span v-else class="text-xs text-gray-500">-</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Service Display (for Applications) -->
    <div v-if="applications.service_configs?.length > 0" class="mb-4 mt-4 shadow-md hover:shadow-lg transition-shadow duration-300">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl card-title">
          Service
        </h2>
      </div>
      <div class="bg-[#ffffff] hover:bg-base-200 px-4 py-4 mb-4 rounded-xl shadow-md bg-gradient-to-b dark:bg-base-200 dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-x-auto">
        <div class="flex items-center gap-3">
          <span class="text-sm text-[#64748B] dark:text-secondary font-medium">Service ID:</span>
          <span class="badge badge-primary badge-lg font-mono">
            {{ applications.service_configs[0]?.service_id || applications.service_configs[0]?.service_name || 'N/A' }}
          </span>
        </div>
      </div>
    </div>
  </div>
  <!-- </div>     -->

  <!-- Delegations -->

  <!-- Unbonding Delegations -->
  <div class="bg-base-100 px-4 pt-3 pb-4 rounded mb-4 shadow" v-if="unbonding && unbonding.length > 0">
    <h2 class="card-title mb-4">{{ $t('account.unbonding_delegations') }}</h2>
    <div class="overflow-x-auto">
      <table class="table text-sm w-full">
        <thead class="bg-base-200">
          <tr class="text-sm font-semibold">
            <th class="py-3 bg-base-300">{{ $t('account.creation_height') }}</th>
            <th class="py-3 bg-base-300">{{ $t('account.initial_balance') }}</th>
            <th class="py-3 bg-base-300">{{ $t('account.balance') }}</th>
            <th class="py-3 bg-base-300">{{ $t('account.completion_time') }}</th>
          </tr>
        </thead>
        <tbody class="text-sm" v-for="(v, index) in unbonding" :key="index">
          <tr>
            <td class="text-caption text-primary py-3 bg-slate-200" colspan="10">
              <RouterLink :to="`/${chain}/staking/${v.validator_address}`">{{ v.validator_address }}</RouterLink>
            </td>
          </tr>
          <tr v-for="entry in v.entries">
            <td class="py-3">{{ entry.creation_height }}</td>
            <td class="py-3">
              {{ format.formatToken({ amount: entry.initial_balance, denom: stakingStore.params.bond_denom, }, true,
                '0,0.[00]') }}
            </td>
            <td class="py-3">
              {{ format.formatToken({ amount: entry.balance, denom: stakingStore.params.bond_denom, }, true, '0,0.[00]')
              }}
            </td>
            <td class="py-3">
              <Countdown :time="new Date(entry.completion_time).getTime() - new Date().getTime()" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-if="performanceType !== 'unknown'" class="pt-3 rounded mb-4">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl card-title">
        {{ performanceType === 'supplier' ? 'Supplier Performance' : 'Application Usage' }}
      </h2>
      <span class="text-xs text-secondary bg-base-200 dark:bg-base-300 px-3 py-1 rounded-full">
        Last {{ performanceRows.length }} days
      </span>
    </div>


    <!-- Charts -->
    <div v-if="performanceRows.length > 0 && !loadingPerformance" class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
      <div class="bg-base-200 pt-3 rounded-lg hover:bg-base-300 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="flex items-center mb-4">
          <div class="text-lg font-semibold text-main ml-5">Daily Rewards Trend</div>
        </div>
        <div class="dark:bg-base-200 bg-base-100 p-4 rounded-md relative">
          <div class="h-80">
            <ApexCharts 
              :type="rewardsChartType" 
              height="280" 
              :options="rewardsChartOptions" 
              :series="rewardsChartSeries"
              :key="`rewards-${rewardsChartType}`"
            />
          </div>
          <!-- Chart Type Selector - Bottom Right -->
          <div class="absolute bottom-2 right-2 tabs tabs-boxed bg-base-200 dark:bg-base-300">
            <button
              @click="rewardsChartType = 'bar'"
              :class="[
                'tab',
                rewardsChartType === 'bar' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Bar Chart">
              <Icon icon="mdi:chart-bar" class="text-sm" />
            </button>
            <button
              @click="rewardsChartType = 'area'"
              :class="[
                'tab',
                rewardsChartType === 'area' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Area Chart">
              <Icon icon="mdi:chart-areaspline" class="text-sm" />
            </button>
            <button
              @click="rewardsChartType = 'line'"
              :class="[
                'tab',
                rewardsChartType === 'line' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Line Chart">
              <Icon icon="mdi:chart-line" class="text-sm" />
            </button>
          </div>
        </div>
      </div>
      <div class="bg-base-200 pt-3 rounded-lg hover:bg-base-300 shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
        <div class="flex items-center mb-4">
          <div class="text-lg font-semibold text-main ml-5">Daily Relays Trend</div>
        </div>
        <div class="dark:bg-base-200 bg-base-100 p-4 rounded-md relative">
          <div class="h-80">
            <ApexCharts 
              :type="relaysChartType" 
              height="280" 
              :options="relaysChartOptions" 
              :series="relaysChartSeries"
              :key="`relays-${relaysChartType}`"
            />
          </div>
          <!-- Chart Type Selector - Bottom Right -->
          <div class="absolute bottom-2 right-2 tabs tabs-boxed bg-base-200 dark:bg-base-300">
            <button
              @click="relaysChartType = 'bar'"
              :class="[
                'tab',
                relaysChartType === 'bar' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Bar Chart">
              <Icon icon="mdi:chart-bar" class="text-sm" />
            </button>
            <button
              @click="relaysChartType = 'area'"
              :class="[
                'tab',
                relaysChartType === 'area' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Area Chart">
              <Icon icon="mdi:chart-areaspline" class="text-sm" />
            </button>
            <button
              @click="relaysChartType = 'line'"
              :class="[
                'tab',
                relaysChartType === 'line' 
                  ? 'tab-active bg-[#09279F] text-white' 
                  : ''
              ]"
              title="Line Chart">
              <Icon icon="mdi:chart-line" class="text-sm" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Detailed Table -->
    <div v-if="performanceRows.length > 0"
      class="bg-[#ffffff] hover:bg-base-200 px-0.5 pt-0.5 pb-0.5 rounded-lg shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
      <div class="flex items-center mb-4 pt-3">
          <div class="text-lg font-semibold text-main ml-5">Performance Summary (Last {{ performanceRows.length }} days)</div>
        </div>
      <div class="services-table-wrapper services-table-scroll rounded-xl">
        <table class="table table-compact w-full">
          <thead class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 sticky top-0 border-0">
            <tr class="dark:bg-[rgba(255,255,255,.03)] bg-base-200 border-b-[0px] text-sm font-semibold">
              <th class="">Day</th>
              <th class="">Rewards (POKT)</th>
              <th class="">Relays</th>
              <th class="">Submissions</th>
              <th class="">Avg Efficiency</th>
              <th class="" v-if="performanceType === 'supplier'">Unique Applications</th>
              <th class="" v-if="performanceType === 'application'">Unique Suppliers</th>
              <th class="">Unique Services</th>
              <th class="">Reward/Relay</th>
            </tr>
          </thead>
          <tbody class="bg-base-100 relative">
            <tr v-if="loadingPerformance">
              <td colspan="10" class="py-8">
                <div class="flex justify-center items-center">
                  <div class="loading loading-spinner loading-md"></div>
                  <span class="ml-2">Loading performance data...</span>Top Services Performance
                </div>
              </td>
            </tr>
            <tr v-else-if="performanceRows.length === 0">
              <td colspan="10" class="py-8">
                <div class="text-center text-gray-500">No performance data available</div>
              </td>
            </tr>
            <tr v-else v-for="(row, i) in performanceRows" :key="i"
              class="hover:bg-gray-100 dark:hover:bg-[#384059] dark:bg-base-200 bg-white border-0 rounded-xl">
              <td class="dark:bg-base-200 bg-white">{{ format.toLocaleDate(row.day_bucket) }}</td>
              <td class="dark:bg-base-200 bg-white">{{ format.formatToken({
                denom: 'upokt', amount:
                  String(row.total_rewards_upokt)
              }) }}</td>
              <td class="dark:bg-base-200 bg-white">{{ formatNumber(row.total_relays) }}</td>
              <td class="dark:bg-base-200 bg-white">{{ formatNumber(row.total_submissions || 0) }}</td>
              <td class="dark:bg-base-200 bg-white">
                <span
                  :class="row.avg_efficiency_percent >= 95 ? 'text-success' : row.avg_efficiency_percent >= 80 ? 'text-warning' : 'text-error'">
                  {{ Number(row.avg_efficiency_percent || 0).toFixed(2) }}%
                </span>
              </td>
              <td class="dark:bg-base-200 bg-white" v-if="performanceType === 'supplier'">{{
                formatNumber(row.unique_applications || 0) }}</td>
              <td class="dark:bg-base-200 bg-white" v-if="performanceType === 'application'">{{
                formatNumber(row.unique_suppliers || 0) }}</td>
              <td class="dark:bg-base-200 bg-white">{{ formatNumber(row.unique_services || 0) }}</td>
              <td class="dark:bg-base-200 bg-white">{{ format.formatToken({ denom: 'upokt', amount: String(row.avg_reward_per_relay || 0) }) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <h2 class="text-2xl card-title mb-4 pt-3">
    {{ $t('account.transactions') }}
  </h2>
  <!-- Transactions -->
  <div class="bg-base-200 px-0.5 pt-0.5 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
    <!-- Filter Section - Compact & Modern -->
    <div class="bg-[#ffffff] dark:bg-[rgba(255,255,255,.03)] rounded-lg border border-base-300 dark:border-base-400 mb-2">
      <!-- Main Filter Bar -->
      <div class="flex flex-wrap items-center gap-3 px-4 py-3">
        <!-- Type Tabs - Compact Horizontal -->
        <div class="flex items-center gap-1 flex-wrap">
          <span class="text-xs font-medium text-base-content/70 mr-1">Type:</span>
          <button
            v-for="typeOption in [
              { value: 'all', label: 'All' },
              { value: 'send', label: 'Send' },
              { value: 'claim', label: 'Claim' },
              { value: 'proof', label: 'Proof' },
              { value: 'governance', label: 'Gov' },
              { value: 'staking', label: 'Stake' }
            ]"
            :key="typeOption.value"
            @click="selectedTypeTab = typeOption.value as any"
            class="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200"
            :class="selectedTypeTab === typeOption.value
              ? 'bg-[#007bff] text-white shadow-sm'
              : 'bg-base-100 text-base-content hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]  border border-base-300 dark:border-base-400'"
          >
            {{ typeOption.label }}
          </button>
        </div>

        <!-- Divider -->
        <div class="h-6 w-px bg-base-300 dark:bg-base-500"></div>

        <!-- Quick Filters -->
        <div class="flex items-center gap-2 flex-wrap">
          <!-- Status -->
          <div class="flex items-center gap-1.5">
            <Icon icon="mdi:check-circle-outline" class="text-base-content/60 text-sm" />
            <select v-model="txStatusFilter" class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-24 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <!-- Sort By -->
          <div class="flex items-center gap-1.5">
            <Icon icon="mdi:sort" class="text-base-content/60 text-sm" />
            <select v-model="txSortBy" class="select select-bordered select-xs h-8 min-h-8 px-2 text-xs w-28 hover:bg-base-200 dark:bg-[rgba(255,255,255,.03)] dark:hover:bg-[rgba(255,255,255,0.06)]">
              <option value="timestamp">Time</option>
              <option value="amount">Amount</option>
              <option value="fee">Fee</option>
              <option value="block_height">Block</option>
              <option value="type">Type</option>
              <option value="status">Status</option>
            </select>
          </div>

          <!-- Sort Order Toggle -->
          <button
            @click="txSortOrder = txSortOrder === 'desc' ? 'asc' : 'desc'"
            class="btn btn-xs h-8 min-h-8 px-2 gap-1"
            :class="txSortOrder === 'desc' ? 'btn-primary' : 'btn-ghost'"
            :title="txSortOrder === 'desc' ? 'Descending' : 'Ascending'"
          >
            <Icon :icon="txSortOrder === 'desc' ? 'mdi:sort-descending' : 'mdi:sort-ascending'" class="text-sm" />
          </button>
        </div>

        <!-- Advanced Filters Toggle -->
        <div class="ml-auto">
          <button
            @click="showAdvancedTxFilters = !showAdvancedTxFilters"
            class="btn btn-xs h-8 min-h-8 px-3 gap-1.5"
            :class="showAdvancedTxFilters ? 'btn-primary' : 'btn-ghost'"
          >
            <Icon :icon="showAdvancedTxFilters ? 'mdi:chevron-up' : 'mdi:chevron-down'" class="text-sm" />
            <span class="text-xs">Advanced</span>
          </button>
        </div>
      </div>

      <!-- Advanced Filters - Collapsible -->
      <div v-show="showAdvancedTxFilters" class="border-t border-base-300 dark:border-base-400 px-4 py-3">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Date Range -->
          <div>
            <label class="label py-1">
              <span class="label-text text-xs font-medium flex items-center gap-1.5">
                <Icon icon="mdi:calendar-range" class="text-sm" />
                Date Range
              </span>
            </label>
            <div class="flex gap-2">
              <input
                v-model="txStartDate"
                type="datetime-local"
                class="input input-bordered input-xs h-8 text-xs flex-1"
                placeholder="Start"
              />
              <span class="self-center text-xs text-base-content/50">→</span>
              <input
                v-model="txEndDate"
                type="datetime-local"
                class="input input-bordered input-xs h-8 text-xs flex-1"
                placeholder="End"
              />
            </div>
          </div>

          <!-- Amount Range -->
          <div>
            <label class="label py-1">
              <span class="label-text text-xs font-medium flex items-center gap-1.5">
                <Icon icon="mdi:currency-usd" class="text-sm" />
                Amount Range
              </span>
            </label>
            <div class="flex gap-2">
              <input
                v-model.number="txMinAmount"
                type="number"
                class="input input-bordered input-xs h-8 text-xs flex-1"
                placeholder="Min"
              />
              <span class="self-center text-xs text-base-content/50">-</span>
              <input
                v-model.number="txMaxAmount"
                type="number"
                class="input input-bordered input-xs h-8 text-xs flex-1"
                placeholder="Max"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="services-table-wrapper services-table-scroll bg-base-200 px-0.5 pt-0.5 pb-4 mb-4 rounded-xl shadow-md bg-gradient-to-b  dark:bg-[rgba(255,255,255,.03)] border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg overflow-auto">
      <table class="table table-compact w-full">
        <thead class="bg-base-200 dark:bg-[rgba(255,255,255,.03)] sticky top-0 border-0">
          <tr class="border-b-[0px] text-sm font-semibold">
            <th class="bg-base-200 dark:bg-[rgba(255,255,255,.03)">{{ $t('account.height') }}</th>
            <th class="bg-base-200 dark:bg-[rgba(255,255,255,.03)">{{ $t('account.hash') }}</th>
            <th class="bg-base-200 dark:bg-[rgba(255,255,255,.03)">{{ $t('account.type') }}</th>
            <th class="bg-base-200 dark:bg-[rgba(255,255,255,.03)">{{ $t('account.amount') }}</th>
            <th class="bg-base-200 dark:bg-[rgba(255,255,255,.03)">{{ $t('tx.fee') }}</th>
            <th class="bg-base-200 dark:bg-[rgba(255,255,255,.03)">{{ $t('account.time') }}</th>
          </tr>
        </thead>
        <tbody class="bg-base-100 relative">
          <tr v-if="loadingTxs" class="text-center">
            <td colspan="6" class="py-8">
              <div class="flex justify-center items-center">
                <div class="loading loading-spinner loading-md"></div>
                <span class="ml-2">Loading transactions...</span>
              </div>
            </td>
          </tr>
          <tr v-else-if="txs?.length === 0">
            <td colspan="6">
              <div class="text-center">{{ $t('account.no_transactions') }}</div>
            </td>
          </tr>
          <tr v-for="(item, index) in txs" :key="item.hash" class="hover:bg-gray-100 dark:hover:bg-[rgba(255,255,255,0.03)]  dark:bg-base-200 bg-white border-0 rounded-xl">
            <td class="text-sm py-3">
              <RouterLink :to="`/${chain}/blocks/${item.block_height}`" class="dark:text-primary text-[#09279F] dark:invert">
                {{ item.block_height }}</RouterLink>
            </td>
            <td class="truncate py-3" style="max-width: 200px">
              <RouterLink :to="`/${chain}/tx/${item.hash}`" class="dark:text-primary text-[#09279F] dark:invert">
                {{ item.hash }}
              </RouterLink>
            </td>
            <td class="py-3">
              <div class="flex items-center">
                <span class="mr-2">{{ item.type }}</span>
                <Icon v-if="item.status === 'true'" icon="mdi-check" class="text-[#60BC29] text-lg" />
                <Icon v-else icon="mdi-multiply" class="text-error text-lg" />
              </div>
            </td>
            <td class="py-3">
              {{ format.formatToken({ denom: 'upokt', amount: item.amount }) }}
            </td>
            <td class="py-3">
              {{ format.formatToken({ denom: 'upokt', amount: item.fee }) }}
            </td>
            <td class="py-3">
              {{ format.toLocaleDate(item.timestamp) }}
              <span class="text-xs">({{ format.toDay(item.timestamp, 'from') }})</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="flex flex-col md:!flex-row md:justify-between md:items-center gap-4 my-6 px-3 md:px-6">
      <!-- Page Size Selector -->
      <div class="flex items-center gap-2 justify-center md:justify-start">
        <span class="text-sm text-gray-600">Show:</span>
        <select 
          v-model="txItemsPerPage" 
          class="select select-bordered select-sm w-20"
        >
          <option :value="10">10</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
        <span class="text-sm text-gray-600 hidden sm:inline">per page</span>
      </div>

      <!-- Pagination Info and Controls -->
      <div class="flex flex-col sm:flex-row items-center gap-3 sm:gap-2">
        <!-- Info Text - Hidden on mobile, shown on tablet+ -->
        <span class="text-sm text-gray-600 hidden md:inline">
          Showing {{ ((currentTxPage - 1) * txItemsPerPage) + 1 }} to {{ Math.min(currentTxPage * txItemsPerPage, totalTxCount) }} of {{ totalTxCount }} transactions
        </span>
        
        <!-- Compact Info for Mobile -->
        <span class="text-xs text-gray-600 md:hidden text-center">
          {{ totalTxCount }} total
        </span>
        
        <!-- Pagination Buttons -->
        <div class="flex items-center gap-1">
          <!-- First/Last buttons - Hidden on mobile -->
          <button
            class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px] hidden sm:inline-block" 
            @click="currentTxPage = 1"
            :disabled="currentTxPage === 1 || totalTxPages === 0"
          >
            First
          </button>
          <button
            class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[8px] sm:px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
            @click="currentTxPage--"
            :disabled="currentTxPage === 1 || totalTxPages === 0"
          >
            &lt;
          </button>

          <span class="text-xs px-2 whitespace-nowrap">
            Page {{ currentTxPage }} of {{ totalTxPages }}
          </span>

          <button
            class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[8px] sm:px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px]" 
            @click="currentTxPage++"
            :disabled="currentTxPage === totalTxPages || totalTxPages === 0"
          >
            &gt;
          </button>
          <button
            class="page-btn bg-[#f8f9fa] border border-[#ccc] rounded px-[10px] py-[5px] cursor-pointer text-[#007bff] transition-colors duration-200 hover:bg-[#e9ecef] disabled:opacity-50 disabled:cursor-not-allowed text-[14px] hidden sm:inline-block" 
            @click="currentTxPage = totalTxPages"
            :disabled="currentTxPage === totalTxPages || totalTxPages === 0"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Performance / Usage (Supplier or Application) -->


  <!-- Account -->
  <div v-if="account" class="dark:bg-[rgba(255,255,255,.03)]  bg-[#ffffff] px-0.5 pt-0.5 pb-0.5 rounded-xl mb-4 shadow-md bg-gradient-to-b border dark:border-white/10 dark:shadow-[0 solid #e5e7eb] hover:shadow-lg">
    <h2 class="card-title text-2xl px-4 py-2">{{ $t('account.acc') }}</h2>
    <DynamicComponent :value="account" />
  </div>

  <div v-else class="text-no text-sm">
    {{ $t('account.error') }}
  </div>
  </div>
</template>

<style scoped>
.desktop-address {
  display: none;
}

.mobile-address {
  display: block;
}

/* Media query for desktop */
@media (min-width: 1024px) {
  .desktop-address {
    display: flex;
  }

  .mobile-address {
    display: none;
  }
}

.services-table-wrapper {
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.services-table-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
}

.services-table-scroll table {
  margin-bottom: 0;
}

.services-table-scroll thead {
  position: sticky;
  top: 0;
  background: inherit;
  z-index: 1;
}
</style>