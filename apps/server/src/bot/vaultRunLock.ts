const vaultLocks = new Map<string, Promise<void>>();

export async function withVaultRunLock<T>(vaultAddress: string, run: () => Promise<T>): Promise<T> {
  const key = vaultAddress.toLowerCase();
  const previous = vaultLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  vaultLocks.set(
    key,
    previous.then(() => current),
  );
  await previous;
  try {
    return await run();
  } finally {
    release();
    if (vaultLocks.get(key) === current) {
      vaultLocks.delete(key);
    }
  }
}
