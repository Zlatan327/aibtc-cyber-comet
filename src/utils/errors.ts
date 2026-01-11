/**
 * Base error class for stx402-agent
 */
export class Stx402Error extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "Stx402Error";
  }
}

/**
 * Error for invalid configuration
 */
export class ConfigError extends Stx402Error {
  constructor(message: string, details?: unknown) {
    super(message, "CONFIG_ERROR", details);
    this.name = "ConfigError";
  }
}

/**
 * Error for transaction failures
 */
export class TransactionError extends Stx402Error {
  constructor(message: string, public readonly txid?: string, details?: unknown) {
    super(message, "TRANSACTION_ERROR", details);
    this.name = "TransactionError";
  }
}

/**
 * Error for API failures
 */
export class ApiError extends Stx402Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    details?: unknown
  ) {
    super(message, "API_ERROR", details);
    this.name = "ApiError";
  }
}

/**
 * Error for contract call failures
 */
export class ContractError extends Stx402Error {
  constructor(
    message: string,
    public readonly contractId?: string,
    details?: unknown
  ) {
    super(message, "CONTRACT_ERROR", details);
    this.name = "ContractError";
  }
}

/**
 * Format error for tool response
 */
export function formatError(error: unknown): { message: string; code?: string; details?: unknown } {
  if (error instanceof Stx402Error) {
    return {
      message: error.message,
      code: error.code,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: "Unknown error occurred" };
}

/**
 * Create error response for MCP tools
 */
export function createErrorResponse(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const formatted = formatError(error);
  return {
    content: [
      {
        type: "text",
        text: `Error: ${formatted.message}${formatted.code ? ` (${formatted.code})` : ""}`,
      },
    ],
    isError: true,
  };
}
