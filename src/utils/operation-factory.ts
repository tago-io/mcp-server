/**
 * Generic operation factory for routing operations to their respective handlers
 */
export class OperationFactory<TParams extends { operation: string }, TResult = string> {
  private operations = new Map<string, (params: TParams) => Promise<TResult>>();

  /**
   * Register an operation handler
   * @param operationType The operation type identifier
   * @param handler The handler function for this operation
   */
  register(operationType: string, handler: (params: TParams) => Promise<TResult>): this {
    this.operations.set(operationType, handler);
    return this;
  }

  /**
   * Execute the operation based on the operation type in params
   * @param params The parameters containing the operation type
   * @returns The result from the appropriate handler
   */
  async execute(params: TParams): Promise<TResult> {
    const { operation } = params;
    const handler = this.operations.get(operation);

    if (!handler) {
      throw new Error(`Unsupported operation: ${operation}. Available operations: ${Array.from(this.operations.keys()).join(", ")}`);
    }

    return handler(params);
  }

  /**
   * Get all registered operation types
   */
  getOperationTypes(): string[] {
    return Array.from(this.operations.keys());
  }

  /**
   * Check if an operation is registered
   */
  hasOperation(operationType: string): boolean {
    return this.operations.has(operationType);
  }
}

/**
 * Create a new operation factory instance
 */
export function createOperationFactory<TParams extends { operation: string }, TResult = string>(): OperationFactory<TParams, TResult> {
  return new OperationFactory<TParams, TResult>();
}
