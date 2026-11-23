const parsed = Number(process.env.VIOLATION_BLOCK_LEVEL);
export const VIOLATION_BLOCK_LEVEL = Number.isInteger(parsed) && parsed > 0 ? parsed : 3;
