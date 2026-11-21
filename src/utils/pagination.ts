export interface KeysetCursor {
  createdAt: Date;
  id: number;
}

export function formatKeysetCursor(createdAt: Date | string, id: bigint | number | string): string {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
  return `${iso}_${String(id)}`;
}

export function parseKeysetCursor(cursor: string | null | undefined): KeysetCursor | null {
  if (!cursor || typeof cursor !== "string") return null;
  const idx = cursor.lastIndexOf("_");
  if (idx <= 0 || idx === cursor.length - 1) return null;

  const datePart = cursor.slice(0, idx);
  const idPart = cursor.slice(idx + 1);
  if (!/^\d+$/.test(idPart)) return null;

  const createdAt = new Date(datePart);
  const id = Number(idPart);
  if (Number.isNaN(createdAt.getTime()) || !Number.isSafeInteger(id) || id <= 0) {
    return null;
  }

  return { createdAt, id };
}
