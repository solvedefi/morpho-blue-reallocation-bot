import { formatEther, type Address } from "viem";

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

interface GasAlertContext {
  chainName: string;
  chainId: number;
  account: Address;
  nativeSymbol: string;
  balance: bigint;
}

interface GasAlertWithThreshold extends GasAlertContext {
  threshold: bigint;
}

export function lowGasAlert(ctx: GasAlertWithThreshold): SlackMessage {
  return {
    text: `:rotating_light: LOW GAS on ${ctx.chainName} — balance ${formatEther(ctx.balance)} ${ctx.nativeSymbol}`,
    blocks: [
      header(":rotating_light: Low gas balance"),
      detailsSection(ctx, ctx.threshold),
      divider(),
      contextLine(
        ":arrow_up: *Top up the reallocator EOA* — alerts will keep firing each check until balance recovers.",
      ),
    ],
  };
}

export function approachingGasAlert(ctx: GasAlertWithThreshold): SlackMessage {
  return {
    text: `:large_yellow_circle: Gas balance approaching threshold on ${ctx.chainName} — ${formatEther(ctx.balance)} ${ctx.nativeSymbol} (threshold ${formatEther(ctx.threshold)})`,
    blocks: [
      header(":large_yellow_circle: Gas balance approaching threshold"),
      detailsSection(ctx, ctx.threshold),
      divider(),
      contextLine(
        ":eyes: Heads-up — top up soon to avoid hitting the floor and triggering sustained alerts.",
      ),
    ],
  };
}

export function recoveryAlert(ctx: GasAlertContext): SlackMessage {
  return {
    text: `:white_check_mark: Gas balance recovered on ${ctx.chainName} — ${formatEther(ctx.balance)} ${ctx.nativeSymbol}`,
    blocks: [
      header(":white_check_mark: Gas balance recovered"),
      detailsSection(ctx, null),
      divider(),
      contextLine(":sparkles: Reallocations are running normally again."),
    ],
  };
}

// ---------- block helpers ----------

function header(text: string): HeaderBlock {
  return { type: "header", text: { type: "plain_text", text, emoji: true } };
}

function detailsSection(ctx: GasAlertContext, threshold: bigint | null): SectionBlock {
  const lines = [
    `*Chain:* ${ctx.chainName} \`${String(ctx.chainId)}\``,
    `*Reallocator:* \`${shortAddress(ctx.account)}\``,
    `*Balance:* \`${formatEther(ctx.balance)}\` ${ctx.nativeSymbol}`,
  ];
  if (threshold !== null) {
    lines.push(`*Threshold:* \`${formatEther(threshold)}\` ${ctx.nativeSymbol}`);
  }
  return { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } };
}

function shortAddress(addr: Address): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function divider(): DividerBlock {
  return { type: "divider" };
}

function contextLine(text: string): ContextBlock {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}
