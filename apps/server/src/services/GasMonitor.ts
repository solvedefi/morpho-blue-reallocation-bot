import { formatEther, type Address, type Chain, type Client, type Transport } from "viem";
import { getBalance } from "viem/actions";

import { getChainName, getNativeSymbol } from "../constants.js";
import { logger } from "../logger";

import { MinGasThresholds } from "./MinGasThresholds";
import { approachingGasAlert, lowGasAlert, recoveryAlert, SlackNotifier } from "./SlackNotifier";

// "Approaching" tier: minGasWei ≤ balance < minGasWei × 5/4 (= 1.25×).
// Encoded as a bigint ratio so we never lose precision.
const APPROACHING_FACTOR_NUM = 5n;
const APPROACHING_FACTOR_DEN = 4n;

type GasState = "ok" | "approaching" | "low";

function deriveState(balance: bigint, minGasWei: bigint): GasState {
  if (balance < minGasWei) return "low";
  if (balance * APPROACHING_FACTOR_DEN < minGasWei * APPROACHING_FACTOR_NUM) return "approaching";
  return "ok";
}

export class GasMonitor {
  private slack: SlackNotifier;
  private thresholds: MinGasThresholds;
  private state = new Map<number, GasState>();
  private timeouts = new Map<number, NodeJS.Timeout>();
  private stopped = new Set<number>();

  constructor(slack: SlackNotifier, thresholds: MinGasThresholds) {
    this.slack = slack;
    this.thresholds = thresholds;
  }

  start(
    chainId: number,
    publicClient: Client<Transport, Chain>,
    account: Address,
    adminOverride: bigint | null,
    intervalSec: number,
  ): void {
    this.stop(chainId);
    this.stopped.delete(chainId);

    const tick = async () => {
      try {
        await this.check(chainId, publicClient, account, adminOverride);
      } catch (err) {
        logger.error({ err, chainId, chain: getChainName(chainId) }, "Gas monitor tick failed");
      } finally {
        if (!this.stopped.has(chainId)) {
          const handle = setTimeout(() => void tick(), intervalSec * 1000);
          this.timeouts.set(chainId, handle);
        }
      }
    };

    void tick();

    logger.info({ chainId, chain: getChainName(chainId), intervalSec }, "Gas monitor started");
  }

  stop(chainId: number): void {
    this.stopped.add(chainId);
    const handle = this.timeouts.get(chainId);
    if (handle) {
      clearTimeout(handle);
      this.timeouts.delete(chainId);
    }
    this.state.delete(chainId);
  }

  stopAll(): void {
    for (const chainId of [...this.timeouts.keys()]) {
      this.stop(chainId);
    }
  }

  private async check(
    chainId: number,
    publicClient: Client<Transport, Chain>,
    account: Address,
    adminOverride: bigint | null,
  ): Promise<void> {
    const chainName = getChainName(chainId);
    const nativeSymbol = getNativeSymbol(chainId);
    const log = logger.child({ chainId, chain: chainName });

    let balance: bigint;
    try {
      balance = await getBalance(publicClient, { address: account });
    } catch (err) {
      log.error({ err }, "Gas monitor failed to fetch balance");
      return;
    }

    const threshold = this.thresholds.get(chainId, adminOverride);
    const prev = this.state.get(chainId) ?? "ok";
    const next = deriveState(balance, threshold);

    const balanceFields = {
      balance: balance.toString(),
      threshold: threshold.toString(),
      balanceEth: formatEther(balance),
      nativeSymbol,
    };
    log.info({ evt: "gas_check", ...balanceFields, state: next }, "Gas check");

    // Alert policy:
    //   low         → fire every tick (sustained nag until topped up)
    //   approaching → fire once on entry into the state
    //   ok          → fire recovery once on exit from a non-ok state
    if (next === "low") {
      log.warn({ evt: "gas_low", ...balanceFields }, "Gas LOW");
      await this.slack.send(
        lowGasAlert({ chainName, chainId, account, nativeSymbol, balance, threshold }),
      );
    } else if (next === "approaching" && prev !== "approaching") {
      log.warn({ evt: "gas_approaching", ...balanceFields }, "Gas approaching threshold");
      await this.slack.send(
        approachingGasAlert({ chainName, chainId, account, nativeSymbol, balance, threshold }),
      );
    } else if (next === "ok" && prev !== "ok") {
      log.info({ evt: "gas_recovered", ...balanceFields }, "Gas recovered");
      await this.slack.send(recoveryAlert({ chainName, chainId, account, nativeSymbol, balance }));
    }

    this.state.set(chainId, next);
  }
}
