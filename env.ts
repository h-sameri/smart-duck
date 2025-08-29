const envKeys = [
  "GOOGLE_API_KEY",
  "CG_API_KEY",
  "TG_BOT_TOKEN",
  "DB_PATH",
  "PORT",
  "SERVER_URL",
  "PVT_KEY",
  "CLIENT_PORT",
  "BUN_PUBLIC_SERVER_URL",
  "BUN_VERSION",
] as const;

type ENV = Record<(typeof envKeys)[number], string>;

let env: ENV = {} as any;

export function ensureEnv() {
  for (const key of envKeys) {
    if (!Bun.env[key]) {
      throw new Error(`Environment variable ${key} is not set`);
    }
  }

  env = Object.fromEntries(envKeys.map((key) => [key, Bun.env[key]])) as ENV;
}

export const isProd =
  process.env["NODE_ENV"] === "production" ||
  process.env["NODE_ENV"] === "prod";

// Always ensure environment variables are loaded
ensureEnv();

export default env;
