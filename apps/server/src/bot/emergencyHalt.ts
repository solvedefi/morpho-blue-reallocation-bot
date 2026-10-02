// Vaults hit by the emergency API. Checked inside the vault lock, so it also stops a regular
// run that fetched vault data before the emergency started. In-memory on purpose: the DB
// `enabled=false` written alongside covers restarts.
const halted = new Set<string>();

const key = (chainId: number, vaultAddress: string) =>
  `${String(chainId)}:${vaultAddress.toLowerCase()}`;

export function haltVault(chainId: number, vaultAddress: string) {
  halted.add(key(chainId, vaultAddress));
}

export function resumeVault(chainId: number, vaultAddress: string) {
  halted.delete(key(chainId, vaultAddress));
}

export function isVaultHalted(chainId: number, vaultAddress: string): boolean {
  return halted.has(key(chainId, vaultAddress));
}
