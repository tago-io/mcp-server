interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
  };
}

export type { JsonRpcRequest, JsonRpcResponse };
