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
  const fallback = `:rotating_light: LOW GAS on ${ctx.chainName} — balance ${formatEther(ctx.balance)} ${ctx.nativeSymbol} (~${String(ctx.txsLeft)} txs left)`;

  return {
    text: fallback,
    blocks: [
      header(":rotating_light: Low gas balance"),
      twoFieldSection(
        "Chain",
        `${ctx.chainName}  \`${String(ctx.chainId)}\``,
        "Reallocator",
        `\`${ctx.account}\``,
      ),
      twoFieldSection(
        "Balance",
        `\`${formatEther(ctx.balance)}\` ${ctx.nativeSymbol}`,
        "Threshold",
        `\`${formatEther(ctx.minGasWei)}\` ${ctx.nativeSymbol}`,
      ),
      headroomSection(ctx.txsLeft),
      gasContext(ctx),
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
  const fallback = `:large_yellow_circle: Gas balance approaching threshold on ${ctx.chainName} — ${formatEther(ctx.balance)} ${ctx.nativeSymbol} (threshold ${formatEther(ctx.minGasWei)})`;

  return {
    text: fallback,
    blocks: [
      header(":large_yellow_circle: Gas balance approaching threshold"),
      twoFieldSection(
        "Chain",
        `${ctx.chainName}  \`${String(ctx.chainId)}\``,
        "Reallocator",
        `\`${ctx.account}\``,
      ),
      twoFieldSection(
        "Balance",
        `\`${formatEther(ctx.balance)}\` ${ctx.nativeSymbol}`,
        "Threshold",
        `\`${formatEther(ctx.minGasWei)}\` ${ctx.nativeSymbol}`,
      ),
      headroomSection(ctx.txsLeft),
      gasContext(ctx),
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
  const fallback = `:white_check_mark: Gas balance recovered on ${ctx.chainName} — ${formatEther(ctx.balance)} ${ctx.nativeSymbol}`;

  return {
    text: fallback,
    blocks: [
      header(":white_check_mark: Gas balance recovered"),
      twoFieldSection(
        "Chain",
        `${ctx.chainName}  \`${String(ctx.chainId)}\``,
        "Reallocator",
        `\`${ctx.account}\``,
      ),
      section(
        `*Balance:* \`${formatEther(ctx.balance)}\` ${ctx.nativeSymbol}  •  *Headroom:* ~*${String(ctx.txsLeft)}* tx(s)`,
      ),
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
  const fallback = `:warning: Low balance before reallocation on ${ctx.chainName} — have ${formatEther(ctx.balance)} ${ctx.nativeSymbol}, recommended ${formatEther(ctx.requiredWei)} ${ctx.nativeSymbol}`;

  return {
    text: fallback,
    blocks: [
      header(":warning: Low balance before reallocation"),
      twoFieldSection(
        "Chain",
        `${ctx.chainName}  \`${String(ctx.chainId)}\``,
        "Reallocator",
        `\`${ctx.account}\``,
      ),
      twoFieldSection(
        "Balance",
        `\`${formatEther(ctx.balance)}\` ${ctx.nativeSymbol}`,
        "Recommended (×1.5)",
        `\`${formatEther(ctx.requiredWei)}\` ${ctx.nativeSymbol}`,
      ),
      headroomSection(ctx.txsLeft),
      gasContext(ctx),
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

function twoFieldSection(
  label1: string,
  value1: string,
  label2: string,
  value2: string,
): SectionBlock {
  return {
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*${label1}*\n${value1}` },
      { type: "mrkdwn", text: `*${label2}*\n${value2}` },
    ],
  };
}

function headroomSection(txsLeft: number): SectionBlock {
  const emoji = txsLeft <= 1 ? ":fire:" : txsLeft <= 5 ? ":warning:" : ":fuelpump:";
  return section(
    `${emoji} *Headroom:* ~*${String(txsLeft)}* reallocate tx(s) at current gas price`,
  );
}

function gasContext(ctx: GasContext): ContextBlock {
  const sampleSuffix =
    ctx.sampleCount === 0 ? "fallback estimate" : `avg of ${String(ctx.sampleCount)} txs`;
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Gas price: \`${formatGwei(ctx.gasPrice)}\` gwei  •  Avg gasUsed: \`${ctx.avgGasUsed.toString()}\` (${sampleSuffix})`,
      },
    ],
  };
}

function divider(): DividerBlock {
  return { type: "divider" };
}

function contextLine(text: string): ContextBlock {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}
