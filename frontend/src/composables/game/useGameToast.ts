// frontend/src/composables/game/useGameToast.ts
import { ref } from 'vue';

export function useGameToast() {
  const showToast = ref(false);
  const toastMessage = ref('');

  function showNotification(message: string): void {
    toastMessage.value = message;
    showToast.value = true;
    setTimeout(() => {
      showToast.value = false;
    }, 2000);
  }

  return {
    showToast,
    toastMessage,
    showNotification
  };
}