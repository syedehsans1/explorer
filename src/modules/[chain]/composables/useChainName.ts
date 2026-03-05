import { computed, type Ref } from 'vue';
import { useBlockchain } from '@/stores';
import { getApiChainName } from '../utils/constants';

/**
 * Resolves the current chain name and its API-normalised equivalent.
 * @param chainProp - The raw `chain` prop from the route
 */
export function useChainName(chainProp: Ref<string>) {
  const blockchain = useBlockchain();

  const currentChainName = computed(
    () => blockchain?.current?.chainName || chainProp.value || 'pocket-beta'
  );

  const apiChainName = computed(() => getApiChainName(currentChainName.value));

  return { currentChainName, apiChainName };
}
