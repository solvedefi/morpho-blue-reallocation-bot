export interface RetrySettings {
  attempt: number;
  withdrawalHaircut: number;
  highUsageThreshold: number;
  largeWithdrawalRatio: number;
  idleFloorRatio: number;
}

export interface RetryPolicyConfig {
  maxAttempts: number;
  withdrawalHaircuts: number[];
  highUsageThreshold: number;
  largeWithdrawalRatio: number;
  idleFloorRatio: number;
  retryDelaySeconds: number;
}

const DEFAULT_WITHDRAWAL_HAIRCUTS = [1, 0.85, 0.7, 0.55];

export function defaultRetryPolicy(): RetryPolicyConfig {
  return {
    maxAttempts: 4,
    withdrawalHaircuts: [...DEFAULT_WITHDRAWAL_HAIRCUTS],
    highUsageThreshold: 0.97,
    largeWithdrawalRatio: 0.03,
    idleFloorRatio: 0.01,
    retryDelaySeconds: 1,
  };
}

function parseHaircuts(raw: string | undefined): number[] {
  if (!raw?.trim()) {
    return [...DEFAULT_WITHDRAWAL_HAIRCUTS];
  }
  const values = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? values : [...DEFAULT_WITHDRAWAL_HAIRCUTS];
}

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function clampRatio(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function loadRetryPolicyFromEnv(): RetryPolicyConfig {
  const defaults = defaultRetryPolicy();
  const policy: RetryPolicyConfig = {
    maxAttempts: Math.max(
      1,
      Math.floor(parseNumber(process.env.REALLOC_RETRY_MAX_ATTEMPTS, defaults.maxAttempts)),
    ),
    withdrawalHaircuts: parseHaircuts(process.env.REALLOC_RETRY_HAIRCUTS).map(clampRatio),
    highUsageThreshold: clampRatio(
      parseNumber(process.env.REALLOC_RETRY_USAGE_THRESHOLD, defaults.highUsageThreshold),
    ),
    largeWithdrawalRatio: clampRatio(
      parseNumber(process.env.REALLOC_RETRY_LARGE_WITHDRAWAL_RATIO, defaults.largeWithdrawalRatio),
    ),
    idleFloorRatio: clampRatio(
      parseNumber(process.env.REALLOC_RETRY_IDLE_FLOOR_RATIO, defaults.idleFloorRatio),
    ),
    retryDelaySeconds: Math.max(
      0,
      Math.floor(parseNumber(process.env.REALLOC_RETRY_DELAY_SECONDS, defaults.retryDelaySeconds)),
    ),
  };
  return policy;
}

export function haircutForAttempt(policy: RetryPolicyConfig, attempt: number): number {
  if (attempt <= 1) {
    return 1;
  }
  const index = attempt - 1;
  if (index >= policy.withdrawalHaircuts.length) {
    return policy.withdrawalHaircuts[policy.withdrawalHaircuts.length - 1] ?? 1;
  }
  return policy.withdrawalHaircuts[index] ?? 1;
}

export function settingsForAttempt(policy: RetryPolicyConfig, attempt: number): RetrySettings {
  return {
    attempt,
    withdrawalHaircut: haircutForAttempt(policy, attempt),
    highUsageThreshold: policy.highUsageThreshold,
    largeWithdrawalRatio: policy.largeWithdrawalRatio,
    idleFloorRatio: policy.idleFloorRatio,
  };
}

export function sleepSeconds(seconds: number): Promise<void> {
  if (seconds <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}
