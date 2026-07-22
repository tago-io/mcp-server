// JSON-RPC Request
interface JSONRPCRequest {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  id?: string | number | null;
}

// JSON-RPC Success Response
interface JSONRPCSuccess {
  jsonrpc: "2.0";
  result: unknown;
  id: string | number | null;
}

// JSON-RPC Error Response
interface JSONRPCError {
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number | null;
}

export { JSONRPCRequest, JSONRPCSuccess, JSONRPCError };
