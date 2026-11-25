declare module 'pg' {
  export type PoolConfig = {
    connectionString?: string;
    ssl?: false | { rejectUnauthorized?: boolean };
    max?: number;
    connectionTimeoutMillis?: number;
    idleTimeoutMillis?: number;
  };

  export class Pool {
    constructor(config?: PoolConfig);
    query<T = unknown>(query: string, values?: unknown[]): Promise<{ rows: T[] }>;
  }
}
