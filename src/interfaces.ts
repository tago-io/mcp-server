// JSON-RPC Request
interface JSONRPCRequest {
  jsonrpc: "2.0";
  method: string;
  params?: any; // ou params?: Record<string, any> | any[];
  id?: string | number | null;
}

// JSON-RPC Success Response
interface JSONRPCSuccess {
  jsonrpc: "2.0";
  result: any;
  id: string | number | null;
}

// JSON-RPC Error Response
interface JSONRPCError {
  jsonrpc: "2.0";
  error: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number | null;
}

export { JSONRPCRequest, JSONRPCSuccess, JSONRPCError };
