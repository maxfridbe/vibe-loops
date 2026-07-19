/*
 * Global declarations for the vendored UMD libraries in lib/.
 * They are loaded as classic <script> tags, so the app reaches them as
 * globals rather than imports.
 */
import type { Root, RootOptions } from 'react-dom/client';

declare global {
  // React and ReactDOM UMD globals come from @types via `export as namespace`
  // (enabled by allowUmdGlobalAccess). The UMD runtime bundle of react-dom 18
  // additionally exposes the react-dom/client API; declared here by merging.
  namespace ReactDOM {
    function createRoot(container: Element | DocumentFragment, options?: RootOptions): Root;
  }

  // --- sql.js (lib/sql-wasm.js) --------------------------------------------
  interface SqlJsStatement {
    bind(values?: unknown[] | Record<string, unknown>): boolean;
    step(): boolean;
    get(): unknown[];
    getAsObject(): Record<string, unknown>;
    run(values?: unknown[]): void;
    reset(): void;
    free(): boolean;
  }
  interface SqlJsDatabase {
    run(sql: string, params?: unknown[]): SqlJsDatabase;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    prepare(sql: string): SqlJsStatement;
    export(): Uint8Array;
    close(): void;
  }
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => SqlJsDatabase;
  }
  function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;

  // --- lamejs (lib/lame.min.js) --------------------------------------------
  interface LamejsMp3Encoder {
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    flush(): Int8Array;
  }
  const lamejs: {
    Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => LamejsMp3Encoder;
  };
}
