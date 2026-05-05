import { formatEther, formatGwei, type Address } from "viem";

const SLACK_FETCH_TIMEOUT_MS = 5_000;

export class SlackNotifier {
  private webhookUrl: string | undefined;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl ?? process.env.SLACK_WEBHOOK_URL;
    if (!this.webhookUrl) {
      console.warn("SLACK_WEBHOOK_URL not set — Slack alerts disabled");
    }
  }

  isEnabled(): boolean {
    return Boolean(this.webhookUrl);
  }

  async send(message: SlackMessage): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(SLACK_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error(`Slack webhook returned ${String(res.status)}: ${await res.text()}`);
      }
    } catch (err) {
      console.error("Failed to post Slack alert:", err);
    }
  }
}

// ---------- Slack Block Kit types (minimal) ----------

interface PlainText {
  type: "plain_text";
  text: string;
  emoji?: boolean;
}

interface Mrkdwn {
  type: "mrkdwn";
  text: string;
}

interface HeaderBlock {
  type: "header";
  text: PlainText;
}

interface SectionBlock {
  type: "section";
  text?: Mrkdwn;
  fields?: Mrkdwn[];
}

interface ContextBlock {
  type: "context";
  elements: Mrkdwn[];
}

interface DividerBlock {
  type: "divider";
}

type SlackBlock = HeaderBlock | SectionBlock | ContextBlock | DividerBlock;

export interface SlackMessage {
  text: string;
  blocks: SlackBlock[];
}

interface CommonContext {
  chainName: string;
  chainId: number;
  account: Address;
  nativeSymbol: string;
}

interface GasContext {
  gasPrice: bigint;
  avgGasUsed: bigint;
  sampleCount: number;
}

export function lowGasAlert(
  ctx: CommonContext &
    GasContext & {
      balance: bigint;
      minGasWei: bigint;
      txsLeft: number;
    },
): SlackMessage {
  return {
    text: `:rotating_light: LOW GAS on ${ctx.chainName} — balance ${formatEther(ctx.balance)} ${ctx.nativeSymbol} (~${String(ctx.txsLeft)} txs left)`,
    blocks: [
      header(":rotating_light: Low gas balance"),
      stackedSection([
        `*Chain:* ${ctx.chainName} \`${String(ctx.chainId)}\``,
        `*Reallocator:* \`${shortAddress(ctx.account)}\``,
        `*Balance:* \`${formatEther(ctx.balance)}\` ${ctx.nativeSymbol}`,
        `*Threshold:* \`${formatEther(ctx.minGasWei)}\` ${ctx.nativeSymbol}`,
      ]),
      headroomSection(ctx.txsLeft),
      gasContextLine(ctx),
      divider(),
      contextLine(
        ":arrow_up: *Top up the reallocator EOA* — alerts will keep firing each check until balance recovers.",
      ),
    ],
  };
}

export function approachingGasAlert(
  ctx: CommonContext &
    GasContext & {
      balance: bigint;
      minGasWei: bigint;
      txsLeft: number;
    },
): SlackMessage {
  return {
    text: `:large_yellow_circle: Gas balance approaching threshold on ${ctx.chainName} — ${formatEther(ctx.balance)} ${ctx.nativeSymbol} (threshold ${formatEther(ctx.minGasWei)})`,
    blocks: [
      header(":large_yellow_circle: Gas balance approaching threshold"),
      stackedSection([
        `*Chain:* ${ctx.chainName} \`${String(ctx.chainId)}\``,
        `*Reallocator:* \`${shortAddress(ctx.account)}\``,
        `*Balance:* \`${formatEther(ctx.balance)}\` ${ctx.nativeSymbol}`,
        `*Threshold:* \`${formatEther(ctx.minGasWei)}\` ${ctx.nativeSymbol}`,
      ]),
      headroomSection(ctx.txsLeft),
      gasContextLine(ctx),
      divider(),
      contextLine(
        ":eyes: Heads-up — top up soon to avoid hitting the floor and triggering sustained alerts.",
      ),
    ],
  };
}

export function recoveryAlert(
  ctx: CommonContext & {
    balance: bigint;
    txsLeft: number;
  },
): SlackMessage {
  return {
    text: `:white_check_mark: Gas balance recovered on ${ctx.chainName} — ${formatEther(ctx.balance)} ${ctx.nativeSymbol}`,
    blocks: [
      header(":white_check_mark: Gas balance recovered"),
      stackedSection([
        `*Chain:* ${ctx.chainName} \`${String(ctx.chainId)}\``,
        `*Reallocator:* \`${shortAddress(ctx.account)}\``,
        `*Balance:* \`${formatEther(ctx.balance)}\` ${ctx.nativeSymbol}`,
      ]),
      headroomSection(ctx.txsLeft),
      divider(),
      contextLine(":sparkles: Reallocations are running normally again."),
    ],
  };
}

export function lowBalancePreTxAlert(
  ctx: CommonContext &
    GasContext & {
      balance: bigint;
      requiredWei: bigint;
      txsLeft: number;
    },
): SlackMessage {
  return {
    text: `:warning: Low balance before reallocation on ${ctx.chainName} — have ${formatEther(ctx.balance)} ${ctx.nativeSymbol}, recommended ${formatEther(ctx.requiredWei)} ${ctx.nativeSymbol}`,
    blocks: [
      header(":warning: Low balance before reallocation"),
      stackedSection([
        `*Chain:* ${ctx.chainName} \`${String(ctx.chainId)}\``,
        `*Reallocator:* \`${shortAddress(ctx.account)}\``,
        `*Balance:* \`${formatEther(ctx.balance)}\` ${ctx.nativeSymbol}`,
        `*Recommended (×1.5):* \`${formatEther(ctx.requiredWei)}\` ${ctx.nativeSymbol}`,
      ]),
      headroomSection(ctx.txsLeft),
      gasContextLine(ctx),
      divider(),
      contextLine(
        ":information_source: Reallocation will still be attempted — any real insufficient-funds failure will appear in the logs.",
      ),
    ],
  };
}

// ---------- block helpers ----------

function header(text: string): HeaderBlock {
  return { type: "header", text: { type: "plain_text", text, emoji: true } };
}

function section(text: string): SectionBlock {
  return { type: "section", text: { type: "mrkdwn", text } };
}

function stackedSection(lines: string[]): SectionBlock {
  return { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } };
}

function headroomSection(txsLeft: number): SectionBlock {
  return section(`*Headroom:* ${String(txsLeft)} txs at current gas price`);
}

function gasContextLine(ctx: GasContext): ContextBlock {
  const sampleSuffix =
    ctx.sampleCount === 0 ? "fallback estimate" : `last ${String(ctx.sampleCount)} tx`;
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Gas Price: \`${formatGwei(ctx.gasPrice)}\` gwei | Avg Gas Used: \`${formatBigInt(ctx.avgGasUsed)}\` (${sampleSuffix})`,
      },
    ],
  };
}

function shortAddress(addr: Address): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatBigInt(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "_");
}

function divider(): DividerBlock {
  return { type: "divider" };
}

function contextLine(text: string): ContextBlock {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}
