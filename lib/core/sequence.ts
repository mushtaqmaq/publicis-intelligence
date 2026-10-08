import type { Prisma } from "@/generated/prisma/client";

// Gapless numbering: the counter row is incremented in the caller's transaction, so a rolled-back
// document gives its number back and two requests can never get the same number.
export const formatNumber = (prefix: string, n: number, pad = 4) => `${prefix}-${String(n).padStart(pad, "0")}`;

export async function nextNumber(tx: Prisma.TransactionClient, key: string, prefix = key, pad = 4): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO document_sequences ("key", "nextValue") VALUES (${key}, 2)
    ON CONFLICT ("key") DO UPDATE SET "nextValue" = document_sequences."nextValue" + 1
    RETURNING "nextValue" - 1 AS value`;
  return formatNumber(prefix, Number(rows[0].value), pad);
}
