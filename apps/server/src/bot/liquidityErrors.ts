export function isLiquiditySimulationFailure(error: unknown): boolean {
  return matchesLiquidityMessage(errorMessage(error));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function matchesLiquidityMessage(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes("notenoughliquidity")) {
    return true;
  }
  if (lower.includes("not enough liquidity")) {
    return true;
  }
  return lower.includes("insufficient liquidity");
}
