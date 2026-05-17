/**
 * sql.js 类型声明
 * sql.js 没有官方 TypeScript 类型，这里手动定义
 */

declare module 'sql.js' {
  export interface QueryResult {
    columns: string[];
    values: unknown[][];
  }

  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string, params?: unknown[]): QueryResult[];
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJs {
    Database: new (data?: ArrayLike<number> | Buffer) => Database;
  }

  function initSqlJs(): Promise<SqlJs>;
  export default initSqlJs;
}