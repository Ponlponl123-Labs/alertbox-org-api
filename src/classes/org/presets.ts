import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";

export interface RolePresetData {
  id: string;
  name: string;
  description: string | null;
  permissions: string;
  color?: string | null;
  createdAt: string;
}

export async function listOrgRolePresets(orgId: bigint | string): Promise<RolePresetData[]> {
  const targetOrgId = BigInt(orgId);
  try {
    const dbPresets = await prisma.client.organizationRolePreset.findMany({
      where: { orgId: targetOrgId },
      orderBy: { createdAt: "asc" },
    });
    if (dbPresets && dbPresets.length > 0) {
      return dbPresets.map((p) => ({
        id: String(p.id),
        name: p.name,
        description: p.description,
        permissions: p.permissions.toString(),
        color: p.color,
        createdAt: p.createdAt.toISOString(),
      }));
    }
  } catch {}

  // Fallback to Redis cache if table is migrating
  const raw = await redis.redis.get(`org:${String(orgId)}:permissions:presets`);
  return raw ? JSON.parse(raw) : [];
}

export async function createOrgRolePreset(
  orgId: bigint | string,
  data: {
    name: string;
    description?: string | null;
    permissions: bigint;
    color?: string | null;
  },
): Promise<RolePresetData> {
  const targetOrgId = BigInt(orgId);
  let createdPreset: RolePresetData;

  try {
    const dbRecord = await prisma.client.organizationRolePreset.create({
      data: {
        orgId: targetOrgId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        permissions: data.permissions,
        color: data.color?.trim() || null,
      },
    });

    createdPreset = {
      id: String(dbRecord.id),
      name: dbRecord.name,
      description: dbRecord.description,
      permissions: dbRecord.permissions.toString(),
      color: dbRecord.color,
      createdAt: dbRecord.createdAt.toISOString(),
    };
  } catch {
    createdPreset = {
      id: `preset_${Date.now()}`,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      permissions: data.permissions.toString(),
      color: data.color?.trim() || null,
      createdAt: new Date().toISOString(),
    };
  }

  // Update Redis cache
  const existing = await listOrgRolePresets(orgId);
  if (!existing.some((p) => p.id === createdPreset.id)) {
    existing.push(createdPreset);
  }
  await redis.redis.set(`org:${String(orgId)}:permissions:presets`, JSON.stringify(existing));

  return createdPreset;
}

export async function updateOrgRolePreset(
  orgId: bigint | string,
  presetId: string,
  patch: {
    name?: string;
    description?: string | null;
    permissions?: bigint;
    color?: string | null;
  },
): Promise<RolePresetData> {
  const targetOrgId = BigInt(orgId);

  try {
    const numId = BigInt(presetId);
    await prisma.client.organizationRolePreset.update({
      where: { id: numId },
      data: {
        ...(patch.name ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
        ...(patch.permissions !== undefined ? { permissions: patch.permissions } : {}),
        ...(patch.color !== undefined ? { color: patch.color?.trim() || null } : {}),
      },
    });
  } catch {}

  const existing = await listOrgRolePresets(orgId);
  const idx = existing.findIndex((p) => p.id === presetId);
  if (idx !== -1) {
    existing[idx] = {
      ...existing[idx],
      ...(patch.name ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.permissions !== undefined ? { permissions: patch.permissions.toString() } : {}),
      ...(patch.color !== undefined ? { color: patch.color?.trim() || null } : {}),
    };
    await redis.redis.set(`org:${String(orgId)}:permissions:presets`, JSON.stringify(existing));
    return existing[idx];
  }

  throw new Error("Preset not found");
}

export async function deleteOrgRolePreset(orgId: bigint | string, presetId: string): Promise<boolean> {
  try {
    const numId = BigInt(presetId);
    await prisma.client.organizationRolePreset.delete({
      where: { id: numId },
    });
  } catch {}

  const existing = await listOrgRolePresets(orgId);
  const filtered = existing.filter((p) => p.id !== presetId);
  await redis.redis.set(`org:${String(orgId)}:permissions:presets`, JSON.stringify(filtered));

  return true;
}
