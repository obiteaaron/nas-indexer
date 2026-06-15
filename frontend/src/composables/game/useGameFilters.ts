// frontend/src/composables/game/useGameFilters.ts
import { ref, watch } from 'vue';

export function useGameFilters(onChange: () => void) {
  const searchQuery = ref('');
  const filterGenre = ref('');
  const filterYear = ref('');
  const filterScraped = ref('');
  const orderBy = ref('title');

  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  function debouncedSearch(): void {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
      onChange();
    }, 300);
  }

  watch([filterGenre, filterYear, filterScraped, orderBy], () => {
    onChange();
  });

  return {
    searchQuery,
    filterGenre,
    filterYear,
    filterScraped,
    orderBy,
    debouncedSearch
  };
}