import { formatEther, type Address, type Chain, type Client, type Transport } from "viem";
import { getBalance, getGasPrice } from "viem/actions";

import { getChainName, getNativeSymbol } from "../constants.js";
import { type DatabaseClient } from "../database";

import { approachingGasAlert, lowGasAlert, recoveryAlert, SlackNotifier } from "./SlackNotifier";

const RECENT_SAMPLE_LIMIT = 20;
const FALLBACK_GAS_USED = 800_000n;
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

export interface GasSample {
  gasUsed: bigint;
}

export class GasMonitor {
  private slack: SlackNotifier;
  private dbClient: DatabaseClient;
  private state = new Map<number, GasState>();
  private timeouts = new Map<number, NodeJS.Timeout>();
  private stopped = new Set<number>();

  constructor(slack: SlackNotifier, dbClient: DatabaseClient) {
    this.slack = slack;
    this.dbClient = dbClient;
  }

  start(
    chainId: number,
    publicClient: Client<Transport, Chain>,
    account: Address,
    minGasWei: bigint,
    intervalSec: number,
  ): void {
    this.stop(chainId);
    this.stopped.delete(chainId);

    const tick = async () => {
      try {
        await this.check(chainId, publicClient, account, minGasWei);
      } catch (err) {
        console.error(`Gas monitor: tick failed on ${getChainName(chainId)}:`, err);
      } finally {
        if (!this.stopped.has(chainId)) {
          const handle = setTimeout(() => void tick(), intervalSec * 1000);
          this.timeouts.set(chainId, handle);
        }
      }
    };

    void tick();

    console.log(
      `Gas monitor started for chain ${getChainName(chainId)} (threshold: ${formatEther(minGasWei)} ${getNativeSymbol(chainId)}, every ${String(intervalSec)}s)`,
    );
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
    minGasWei: bigint,
  ): Promise<void> {
    const chainName = getChainName(chainId);
    const nativeSymbol = getNativeSymbol(chainId);

    let balance: bigint;
    let gasPrice: bigint;
    try {
      [balance, gasPrice] = await Promise.all([
        getBalance(publicClient, { address: account }),
        getGasPrice(publicClient),
      ]);
    } catch (err) {
      console.error(`Gas monitor: failed to fetch balance/gasPrice on ${chainName}:`, err);
      return;
    }

    const samples = await this.loadSamples(chainId);
    const txsLeft = txsRemaining(balance, samples, gasPrice);
    const avg = avgGasUsed(samples);

    const prev = this.state.get(chainId) ?? "ok";
    const next = deriveState(balance, minGasWei);

    // Structured per-tick observation for log shippers.
    console.log(
      JSON.stringify({
        evt: "gas_check",
        chainId,
        chain: chainName,
        balance: balance.toString(),
        threshold: minGasWei.toString(),
        gasPrice: gasPrice.toString(),
        avgGasUsed: avg.toString(),
        sampleCount: samples.length,
        txsLeft,
        state: next,
      }),
    );

    // Alert policy:
    //   low         → fire every tick (sustained nag until topped up)
    //   approaching → fire once on entry into the state
    //   ok          → fire recovery once on exit from a non-ok state
    if (next === "low") {
      console.warn(
        `[gas] LOW on ${chainName}: ${formatEther(balance)} ${nativeSymbol} (~${String(txsLeft)} txs left)`,
      );
      await this.slack.send(
        lowGasAlert({
          chainName,
          chainId,
          account,
          nativeSymbol,
          balance,
          minGasWei,
          gasPrice,
          avgGasUsed: avg,
          txsLeft,
          sampleCount: samples.length,
        }),
      );
    } else if (next === "approaching" && prev !== "approaching") {
      console.warn(
        `[gas] APPROACHING on ${chainName}: ${formatEther(balance)} ${nativeSymbol} (threshold ${formatEther(minGasWei)})`,
      );
      await this.slack.send(
        approachingGasAlert({
          chainName,
          chainId,
          account,
          nativeSymbol,
          balance,
          minGasWei,
          gasPrice,
          avgGasUsed: avg,
          txsLeft,
          sampleCount: samples.length,
        }),
      );
    } else if (next === "ok" && prev !== "ok") {
      console.log(`[gas] Recovered on ${chainName}: ${formatEther(balance)} ${nativeSymbol}`);
      await this.slack.send(
        recoveryAlert({ chainName, chainId, account, nativeSymbol, balance, txsLeft }),
      );
    }

    this.state.set(chainId, next);
  }

  private async loadSamples(chainId: number): Promise<GasSample[]> {
    const result = await this.dbClient.getRecentGasSamples(chainId, RECENT_SAMPLE_LIMIT);
    if (result.isErr()) {
      console.error(
        `Gas monitor: failed to load gas samples for ${getChainName(chainId)}:`,
        result.error.message,
      );
      return [];
    }
    return result.value;
  }
}

export function avgGasUsed(samples: GasSample[]): bigint {
  if (samples.length === 0) return FALLBACK_GAS_USED;
  const total = samples.reduce((acc, s) => acc + s.gasUsed, 0n);
  return total / BigInt(samples.length);
}

export function estimatedTxCost(samples: GasSample[], gasPrice: bigint): bigint {
  return avgGasUsed(samples) * gasPrice;
}

export function txsRemaining(balance: bigint, samples: GasSample[], gasPrice: bigint): number {
  const cost = estimatedTxCost(samples, gasPrice);
  if (cost === 0n) return Number.MAX_SAFE_INTEGER;
  return Number(balance / cost);
}
