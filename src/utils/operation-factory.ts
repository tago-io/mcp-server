/**
 * Generic operation factory for routing operations to their respective handlers
 */
export interface OperationFactory<TParams extends { operation: string }, TResult = string> {
  register: (operationType: string, handler: (params: TParams) => Promise<TResult>) => OperationFactory<TParams, TResult>;
  execute: (params: TParams) => Promise<TResult>;
  getOperationTypes: () => string[];
  hasOperation: (operationType: string) => boolean;
}

/**
 * Create a new operation factory instance
 */
export function createOperationFactory<TParams extends { operation: string }, TResult = string>(): OperationFactory<TParams, TResult> {
  const operations = new Map<string, (params: TParams) => Promise<TResult>>();

  const factory: OperationFactory<TParams, TResult> = {
    /**
     * Register an operation handler
     * @param operationType The operation type identifier
     * @param handler The handler function for this operation
     */
    register(operationType: string, handler: (params: TParams) => Promise<TResult>) {
      operations.set(operationType, handler);
      return factory;
    },

    /**
     * Execute the operation based on the operation type in params
     * @param params The parameters containing the operation type
     * @returns The result from the appropriate handler
     */
    async execute(params: TParams): Promise<TResult> {
      const { operation } = params;
      const handler = operations.get(operation);

      if (!handler) {
        throw new Error(`Unsupported operation: ${operation}. Available operations: ${Array.from(operations.keys()).join(", ")}`);
      }

      return handler(params);
    },

    /**
     * Get all registered operation types
     */
    getOperationTypes(): string[] {
      return Array.from(operations.keys());
    },

    /**
     * Check if an operation is registered
     */
    hasOperation(operationType: string): boolean {
      return operations.has(operationType);
    },
  };

  return factory;
}
