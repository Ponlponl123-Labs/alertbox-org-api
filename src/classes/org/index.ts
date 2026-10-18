import { db, OrgRole } from "@/db";
import { redis } from "@/core/redis";
import {
  getOrganizationDetails,
  listUserOrganizations,
  deleteOrganization,
} from "./core";
import {
  listOrgMembers,
  updateOrgMemberRole,
  removeOrgMember,
} from "./members";
import {
  createOrgInvite,
  verifyOrgInviteCode,
  acceptOrgInviteCode,
} from "./invites";
import {
  listOrgRolePresets,
  createOrgRolePreset,
  updateOrgRolePreset,
  deleteOrgRolePreset,
  RolePresetData,
} from "./presets";
import { OrgMemberItem, OrgInviteData } from "@/types/org.types";
import { logOrgAudit } from "@/core/audit";

export class Org {
  public id: bigint;
  public data: any = null;

  constructor(id: bigint | string) {
    this.id = BigInt(id);
  }

  /**
   * Factory method to load an initialized Org instance.
   */
  public static async load(id: bigint | string, userId?: bigint | string): Promise<Org | null> {
    const org = new Org(id);
    const data = await org.fetch(userId);
    return data ? org : null;
  }

  /**
   * Static helper to list all organizations a user belongs to.
   */
  public static async listUserOrgs(userId: bigint | string) {
    return listUserOrganizations(BigInt(userId));
  }

  /**
   * Fetch full organization details.
   */
  public async fetch(userId?: bigint | string): Promise<any> {
    if (userId) {
      const details = await getOrganizationDetails(this.id, BigInt(userId));
      this.data = details;
      return details;
    }

    const org = await db
      .selectFrom("Organization")
      .selectAll()
      .where("id", "=", Number(this.id))
      .where("deletedAt", "is", null)
      .executeTakeFirst();

    this.data = org;
    return org;
  }

  /**
   * Update organization settings (name, avatar, banner).
   */
  public async updateSettings(
    updaterUserId: bigint | string,
    data: { name?: string; avatar?: string | null; banner?: string | null },
  ): Promise<any> {
    const updatePayload: any = {};
    if (data.name?.trim()) updatePayload.name = data.name.trim().slice(0, 100);
    if (data.avatar !== undefined) updatePayload.avatar = data.avatar;
    if (data.banner !== undefined) updatePayload.banner = data.banner;

    await db
      .updateTable("Organization")
      .set(updatePayload)
      .where("id", "=", Number(this.id))
      .execute();

    const updated = await db
      .selectFrom("Organization")
      .selectAll()
      .where("id", "=", Number(this.id))
      .executeTakeFirst();

    await logOrgAudit({
      orgId: this.id,
      userId: BigInt(updaterUserId),
      action: "ORG_SETTINGS_UPDATED",
      targetType: "ORGANIZATION",
      targetId: this.id,
      payload: { changedFields: Object.keys(updatePayload) },
    });

    this.data = { ...this.data, ...updated };
    return updated;
  }

  /**
   * Delete organization permanently (soft delete).
   */
  public async delete(ownerId: bigint | string): Promise<boolean> {
    return deleteOrganization(this.id, BigInt(ownerId));
  }

  /**
   * Member management namespace.
   */
  public get members() {
    return {
      list: async (): Promise<OrgMemberItem[]> => {
        return listOrgMembers(this.id);
      },
      updateRole: async (
        targetUserId: bigint | string,
        role: OrgRole,
        permissions?: bigint,
      ) => {
        return updateOrgMemberRole(this.id, targetUserId, role, permissions);
      },
      remove: async (targetUserId: bigint | string) => {
        return removeOrgMember(this.id, targetUserId);
      },
    };
  }

  /**
   * Invitation management namespace.
   */
  public get invites() {
    return {
      create: async (
        inviterId: bigint | string,
        email: string,
        role?: OrgRole,
        permissions?: bigint,
      ) => {
        return createOrgInvite(this.id, BigInt(inviterId), email, role, permissions);
      },
      verify: async (code: string, email: string) => {
        return verifyOrgInviteCode(code, email);
      },
      accept: async (code: string, userId: bigint | string) => {
        return acceptOrgInviteCode(code, BigInt(userId));
      },
    };
  }

  /**
   * Permission presets namespace.
   */
  public get presets() {
    return {
      list: async (): Promise<RolePresetData[]> => {
        return listOrgRolePresets(this.id);
      },
      create: async (data: {
        name: string;
        description?: string | null;
        permissions: bigint;
        color?: string | null;
      }): Promise<RolePresetData> => {
        return createOrgRolePreset(this.id, data);
      },
      update: async (
        presetId: string,
        patch: {
          name?: string;
          description?: string | null;
          permissions?: bigint;
          color?: string | null;
        },
      ): Promise<RolePresetData> => {
        return updateOrgRolePreset(this.id, presetId, patch);
      },
      delete: async (presetId: string): Promise<boolean> => {
        return deleteOrgRolePreset(this.id, presetId);
      },
    };
  }
}

// Export OOP class as default and named export
export default Org;
export { Org as Organization };

// Re-export domain utilities and types
export * from "./core";
export * from "./members";
export * from "./invites";
export * from "./presets";
export type { RolePresetData, OrgMemberItem, OrgInviteData };
