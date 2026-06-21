/**
 * 全局请求状态管理 composable
 * 用于追踪所有异步操作的状态，提供 UI 反馈
 */

import { ref, computed } from 'vue'

// 全局状态
const pendingRequests = ref<Set<string>>(new Set())
const requestMessages = ref<Map<string, string>>(new Map())

/**
 * 生成唯一请求 ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 全局请求状态管理
 */
export function useRequestState() {
  const isAnyPending = computed(() => pendingRequests.value.size > 0)
  const currentMessage = computed(() => {
    const messages = Array.from(requestMessages.value.values())
    return messages.length > 0 ? messages[messages.length - 1] : '处理中...'
  })

  /**
   * 执行异步操作并自动管理状态
   * @param requestFn 异步函数
   * @param message 显示给用户的消息（可选）
   * @returns Promise
   */
  async function withLoading<T>(
    requestFn: () => Promise<T>,
    message?: string
  ): Promise<T> {
    const requestId = generateRequestId()
    pendingRequests.value.add(requestId)
    if (message) {
      requestMessages.value.set(requestId, message)
    }

    try {
      const result = await requestFn()
      return result
    } finally {
      pendingRequests.value.delete(requestId)
      requestMessages.value.delete(requestId)
    }
  }

  /**
   * 为按钮点击创建带状态管理的处理函数
   * @param handler 处理函数
   * @param message 显示消息
   * @returns 带状态管理的处理函数
   */
  function createClickHandler<T extends (...args: any[]) => Promise<any>>(
    handler: T,
    message?: string
  ): T {
    return ((...args: any[]) => withLoading(() => handler(...args), message)) as T
  }

  return {
    isAnyPending,
    currentMessage,
    pendingRequests,
    withLoading,
    createClickHandler,
  }
}

/**
 * 按钮级别的 loading 状态管理
 * 用于单个按钮的 loading 状态控制
 */
export function useButtonLoading() {
  const loading = ref(false)

  /**
   * 执行异步操作并自动管理按钮 loading 状态
   */
  async function withButtonLoading<T>(requestFn: () => Promise<T>): Promise<T> {
    loading.value = true
    try {
      const result = await requestFn()
      return result
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    withButtonLoading,
  }
}

/**
 * 全局实例，用于在组件外部访问状态
 */
export const globalRequestState = {
  isAnyPending: computed(() => pendingRequests.value.size > 0),
  currentMessage: computed(() => {
    const messages = Array.from(requestMessages.value.values())
    return messages.length > 0 ? messages[messages.length - 1] : '处理中...'
  }),
  pendingCount: computed(() => pendingRequests.value.size),
}