/** Type-only shim for the `electrobun/view` module under strict type checking. */

/** Optional transport setter and request handler map on an RPC client. */
export type RpcWithTransport = {
  setTransport?: (transport: unknown) => void;
  request?: Record<string, (...args: never[]) => Promise<unknown>>;
};

/** Handler configuration with optional request and message maps. */
export type DefineRpcConfig = {
  handlers: {
    requests?: Record<string, unknown>;
    messages?: Record<string, unknown>;
  };
};

/**
 * Browser-side host that defines RPC schemas and constructs an RPC-backed
 * instance.
 */
export class Electroview {
  /**
   * Defines a typed RPC schema from the given handler configuration.
   *
   * @param _config Handler configuration for requests and messages.
   * @returns Typed RPC client value for the supplied schema.
   */
  static defineRPC<TSchema = RpcWithTransport>(_config: DefineRpcConfig): TSchema {
    return {} as TSchema;
  }

  /**
   * Constructs an Electroview host bound to the given RPC client.
   *
   * @param _config Construction options that include the RPC client.
   */
  constructor(_config: { rpc: unknown }) {}
}
