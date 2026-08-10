declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

declare var __DAWN_READER_ENV__: Record<string, unknown> | undefined;
