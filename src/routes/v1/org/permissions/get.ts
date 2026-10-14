import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { OrgPerm, RolePresets, hasPermission } from "@/utils/rbac";
import { OrgRole } from "@/generated/prisma/client";
import { resolveOrgId } from "@/core/org";

export const PERMISSION_DEFINITIONS = [
  // 0-9: Organization Administration
  {
    key: "VIEW_ORG",
    name: "View Organization",
    category: "Organization Administration",
    description: "View organization profile, member list, and activity overview.",
    bitmask: OrgPerm.VIEW_ORG.toString(),
  },
  {
    key: "MANAGE_SETTINGS",
    name: "Manage Settings",
    category: "Organization Administration",
    description: "Update organization name, custom slug, avatar, and billing profile.",
    bitmask: OrgPerm.MANAGE_SETTINGS.toString(),
  },
  {
    key: "MANAGE_MEMBERS",
    name: "Manage Members",
    category: "Organization Administration",
    description: "Invite new team members, generate 8-digit OTP join codes, and remove members.",
    bitmask: OrgPerm.MANAGE_MEMBERS.toString(),
  },
  {
    key: "MANAGE_ROLES",
    name: "Manage Roles & Permissions",
    category: "Organization Administration",
    description: "Create custom permission presets and reassign staff capabilities.",
    bitmask: OrgPerm.MANAGE_ROLES.toString(),
  },
  {
    key: "DELETE_ORG",
    name: "Delete Organization",
    category: "Organization Administration",
    description: "Permanently delete the organization and all attached streamer channels.",
    bitmask: OrgPerm.DELETE_ORG.toString(),
  },

  // 10-19: Streamer & Profile Operations
  {
    key: "VIEW_STREAMERS",
    name: "View Streamer Channels",
    category: "Streamer Channels",
    description: "View channel profiles, donation handles, and social links.",
    bitmask: OrgPerm.VIEW_STREAMERS.toString(),
  },
  {
    key: "CREATE_STREAMER",
    name: "Create Channel",
    category: "Streamer Channels",
    description: "Provision new streamer channel handles under this organization.",
    bitmask: OrgPerm.CREATE_STREAMER.toString(),
  },
  {
    key: "EDIT_STREAMER_PROFILE",
    name: "Edit Channel Profile",
    category: "Streamer Channels",
    description: "Edit display name, bio, avatar, banner, and social media handles.",
    bitmask: OrgPerm.EDIT_STREAMER_PROFILE.toString(),
  },
  {
    key: "DELETE_STREAMER",
    name: "Delete Channel",
    category: "Streamer Channels",
    description: "Soft-delete streamer channels and archive their public pages.",
    bitmask: OrgPerm.DELETE_STREAMER.toString(),
  },

  // 20-29: Widgets & OBS Overlays
  {
    key: "VIEW_WIDGETS",
    name: "View Widgets",
    category: "Widgets & Overlays",
    description: "View OBS browser source URLs and widget tokens.",
    bitmask: OrgPerm.VIEW_WIDGETS.toString(),
  },
  {
    key: "MANAGE_ALERTBOX",
    name: "Manage AlertBox",
    category: "Widgets & Overlays",
    description: "Customize alert templates, sounds, animations, and typography.",
    bitmask: OrgPerm.MANAGE_ALERTBOX.toString(),
  },
  {
    key: "ROTATE_WIDGET_TOKENS",
    name: "Rotate Widget Tokens",
    category: "Widgets & Overlays",
    description: "Regenerate compromised browser source URLs and cryptographic tokens.",
    bitmask: OrgPerm.ROTATE_WIDGET_TOKENS.toString(),
  },

  // 30-39: Integrations & Payments
  {
    key: "VIEW_INTEGRATIONS",
    name: "View Integrations",
    category: "Integrations & Gateways",
    description: "View payment connection statuses (Streamlabs, BMAC, Ko-fi).",
    bitmask: OrgPerm.VIEW_INTEGRATIONS.toString(),
  },
  {
    key: "MANAGE_INTEGRATIONS",
    name: "Manage Integrations",
    category: "Integrations & Gateways",
    description: "Connect or disconnect external payment relays and webhooks.",
    bitmask: OrgPerm.MANAGE_INTEGRATIONS.toString(),
  },

  // 40-49: Financials, Analytics & Logs
  {
    key: "VIEW_ANALYTICS",
    name: "View Analytics",
    category: "Analytics & Finance",
    description: "Access supporter metrics, tip velocity, and real-time graphs.",
    bitmask: OrgPerm.VIEW_ANALYTICS.toString(),
  },
  {
    key: "VIEW_TRANSACTIONS",
    name: "View Transactions",
    category: "Analytics & Finance",
    description: "Inspect raw donation logs, supporter notes, and payment amounts.",
    bitmask: OrgPerm.VIEW_TRANSACTIONS.toString(),
  },
  {
    key: "EXPORT_REPORTS",
    name: "Export Financial Reports",
    category: "Analytics & Finance",
    description: "Export audit logs, donation CSVs, and revenue summaries.",
    bitmask: OrgPerm.EXPORT_REPORTS.toString(),
  },
];

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/permissions",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const callerMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.VIEW_ORG)) {
        set.status = "Forbidden";
        return "Access denied";
      }

      // 1. System Presets with their active flags
      const systemPresets = Object.entries(RolePresets).map(([role, mask]) => {
        const maskBigInt = BigInt(mask);
        const grantedKeys = PERMISSION_DEFINITIONS.filter((def) => {
          const bit = BigInt(def.bitmask);
          return (maskBigInt & bit) === bit;
        }).map((d) => d.key);

        return {
          role: role as OrgRole,
          name: role,
          isSystem: true,
          permissions: mask.toString(),
          grantedKeys,
        };
      });

      // 2. Organization Custom Presets from Redis
      const rawCustom = await redis.redis.get(`org:${String(orgId)}:permissions:presets`);
      const customPresets = rawCustom ? JSON.parse(rawCustom) : [];

      return {
        definitions: PERMISSION_DEFINITIONS,
        systemPresets,
        customPresets,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get organization permissions and presets",
        description: "Returns all system RBAC bitmask permissions and presets for the organization.",
      },
    },
  );

export default endpoint;
