// No imports, so scripts/migrate.ts can load this file with plain Node.js.

/**
 * Asks node-postgres for full TLS certificate checks. Neon's connection strings say
 * `sslmode=require`, which pg 8 treats as `verify-full` but warns that pg 9 will weaken to
 * libpq's meaning (encrypt without checking the certificate). Naming `verify-full` keeps the
 * stronger check in both versions and silences the warning. Local URLs are left alone.
 */
export function withVerifiedTls(databaseUrl: string): string {
  return databaseUrl.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
}
