export type ClientAccountContext = {
  accountId: string;
  environment: "beta" | "public";
  canClaimLegacyLocalData: boolean;
};

let activeContext: ClientAccountContext | null = null;
let activeGeneration = 0;

export function configureClientAccountContext(context: ClientAccountContext) {
  if (!context.accountId) throw new Error("Reader account is required for local storage.");
  if (
    activeContext?.accountId !== context.accountId
    || activeContext?.environment !== context.environment
  ) activeGeneration += 1;
  activeContext = { ...context };
  return activeGeneration;
}

export function requireClientAccountContext() {
  if (!activeContext) throw new Error("Reader account context has not been configured.");
  return activeContext;
}

export function clientAccountGeneration() {
  requireClientAccountContext();
  return activeGeneration;
}

export function clientAccountNamespace() {
  const context = requireClientAccountContext();
  return `${context.environment}:${context.accountId}`;
}

export function accountDatabaseName(baseName: string, version: number) {
  return `${baseName}:v${version}:${encodeURIComponent(clientAccountNamespace())}`;
}

export function accountStoragePrefix() {
  return `dawn-reader:v3:${encodeURIComponent(clientAccountNamespace())}:`;
}

export function readerLocalStorage(storage: Storage = localStorage): Storage {
  const prefix = accountStoragePrefix();
  const scopedKeys = () => {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    return keys;
  };
  return {
    get length() { return scopedKeys().length; },
    clear() { for (const key of scopedKeys()) storage.removeItem(key); },
    getItem(key: string) { return storage.getItem(`${prefix}${key}`); },
    key(index: number) {
      const key = scopedKeys()[index];
      return key ? key.slice(prefix.length) : null;
    },
    removeItem(key: string) { storage.removeItem(`${prefix}${key}`); },
    setItem(key: string, value: string) { storage.setItem(`${prefix}${key}`, value); },
  };
}
