/** The MCP layer converts thrown errors into isError results, so no custom error hierarchy is needed. */
function invalidParamMessage(param: string, constraint: string, example: string): string {
  return `Invalid \`${param}\`: ${constraint}. Valid example: ${example}`;
}

function invalidParamError(param: string, constraint: string, example: string): Error {
  return new Error(invalidParamMessage(param, constraint, example));
}

export { invalidParamError, invalidParamMessage };
