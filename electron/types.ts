// 全局状态管理
export let isQuitting = false;

export function setQuitting(value: boolean): void {
  isQuitting = value;
}