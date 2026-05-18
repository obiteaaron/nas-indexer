/**
 * 第三方库类型声明
 */

declare module 'vue-virtual-scroller' {
  import { DefineComponent } from 'vue';
  export const RecycleScroller: DefineComponent<{
    items: unknown[];
    itemSize: number;
    keyField?: string;
  }, unknown, unknown>;
}

declare module 'pinyin-pro' {
  export function pinyin(text: string, options?: { toneType?: 'symbol' | 'num' | 'none'; type?: 'array' | 'string' }): string[] | string;
}

declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const component: DefineComponent<unknown, unknown, unknown>;
  export default component;
}