import { db } from "@/db";
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
  const targetOrgId = Number(orgId);
  try {
    const dbPresets = await db
      .selectFrom("OrganizationRolePreset")
      .selectAll()
      .where("orgId", "=", targetOrgId)
      .orderBy("createdAt", "asc")
      .execute();

    if (dbPresets && dbPresets.length > 0) {
      return dbPresets.map((p) => ({
        id: String(p.id),
        name: p.name,
        description: p.description,
        permissions: p.permissions.toString(),
        color: p.color,
        createdAt: new Date(p.createdAt).toISOString(),
      }));
    }
  } catch {}

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
  const targetOrgId = Number(orgId);
  let createdPreset: RolePresetData;

  try {
    const insertResult = await db
      .insertInto("OrganizationRolePreset")
      .values({
        orgId: targetOrgId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        permissions: Number(data.permissions),
        color: data.color?.trim() || null,
        updatedAt: new Date(),
      })
      .executeTakeFirstOrThrow();

    const insertedId = insertResult.insertId ? Number(insertResult.insertId) : Date.now();
    createdPreset = {
      id: String(insertedId),
      name: data.name.trim(),
      description: data.description?.trim() || null,
      permissions: data.permissions.toString(),
      color: data.color?.trim() || null,
      createdAt: new Date().toISOString(),
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
  try {
    const numId = Number(presetId);
    const updatePayload: any = { updatedAt: new Date() };
    if (patch.name) updatePayload.name = patch.name.trim();
    if (patch.description !== undefined) updatePayload.description = patch.description?.trim() || null;
    if (patch.permissions !== undefined) updatePayload.permissions = Number(patch.permissions);
    if (patch.color !== undefined) updatePayload.color = patch.color?.trim() || null;

    await db
      .updateTable("OrganizationRolePreset")
      .set(updatePayload)
      .where("id", "=", numId)
      .execute();
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
    const numId = Number(presetId);
    await db
      .deleteFrom("OrganizationRolePreset")
      .where("id", "=", numId)
      .execute();
  } catch {}

  const existing = await listOrgRolePresets(orgId);
  const filtered = existing.filter((p) => p.id !== presetId);
  await redis.redis.set(`org:${String(orgId)}:permissions:presets`, JSON.stringify(filtered));

  return true;
}
