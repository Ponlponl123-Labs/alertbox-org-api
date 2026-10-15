import Elysia from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm, RolePresets } from "@/utils/rbac";
import { OrgRole } from "@/generated/prisma/client";
import { authorizeOrg } from "@/core/org";
import { listOrgRolePresets } from "@/classes/org/presets";

export const PERMISSION_DEFINITIONS = [
  // 0-9: Organization Management
  {
    key: "ORG_VIEW",
    name: "View Organization",
    category: "Organization Administration",
    description: "View organization profile, member list, and activity overview.",
    bitmask: OrgPerm.ORG_VIEW.toString(),
  },
  {
    key: "ORG_MANAGE",
    name: "Manage Settings",
    category: "Organization Administration",
    description: "Update organization name, custom slug, avatar, and billing profile.",
    bitmask: OrgPerm.ORG_MANAGE.toString(),
  },
  {
    key: "ORG_MEMBERS_MANAGE",
    name: "Manage Members",
    category: "Organization Administration",
    description: "Invite new team members, generate 8-digit OTP join codes, and remove members.",
    bitmask: OrgPerm.ORG_MEMBERS_MANAGE.toString(),
  },
  {
    key: "ORG_ROLES_MANAGE",
    name: "Manage Roles & Permissions",
    category: "Organization Administration",
    description: "Create custom permission presets and reassign staff capabilities.",
    bitmask: OrgPerm.ORG_ROLES_MANAGE.toString(),
  },
  {
    key: "ORG_DELETE",
    name: "Delete Organization",
    category: "Organization Administration",
    description: "Permanently delete the organization and all attached streamer channels.",
    bitmask: OrgPerm.ORG_DELETE.toString(),
  },

  // 10-19: Streamer Channels Management
  {
    key: "STREAMER_VIEW",
    name: "View Streamer Channels",
    category: "Streamer Channels",
    description: "View channel profiles, donation handles, and social links.",
    bitmask: OrgPerm.STREAMER_VIEW.toString(),
  },
  {
    key: "STREAMER_CREATE",
    name: "Create Channel",
    category: "Streamer Channels",
    description: "Provision new streamer channel handles under this organization.",
    bitmask: OrgPerm.STREAMER_CREATE.toString(),
  },
  {
    key: "STREAMER_MANAGE",
    name: "Edit Channel Profile",
    category: "Streamer Channels",
    description: "Edit display name, bio, avatar, banner, and social media handles.",
    bitmask: OrgPerm.STREAMER_MANAGE.toString(),
  },
  {
    key: "STREAMER_DELETE",
    name: "Delete Channel",
    category: "Streamer Channels",
    description: "Soft-delete streamer channels and archive their public pages.",
    bitmask: OrgPerm.STREAMER_DELETE.toString(),
  },

  // 20-29: Widgets & OBS Overlays
  {
    key: "WIDGET_VIEW",
    name: "View Widgets",
    category: "Widgets & Overlays",
    description: "View OBS browser source URLs and widget tokens.",
    bitmask: OrgPerm.WIDGET_VIEW.toString(),
  },
  {
    key: "WIDGET_MANAGE",
    name: "Manage AlertBox",
    category: "Widgets & Overlays",
    description: "Customize alert templates, sounds, animations, and typography.",
    bitmask: OrgPerm.WIDGET_MANAGE.toString(),
  },
  {
    key: "WIDGET_TOKEN_ROTATE",
    name: "Rotate Widget Tokens",
    category: "Widgets & Overlays",
    description: "Regenerate compromised browser source URLs and cryptographic tokens.",
    bitmask: OrgPerm.WIDGET_TOKEN_ROTATE.toString(),
  },

  // 30-39: Integrations & Payments
  {
    key: "INTEGRATION_VIEW",
    name: "View Integrations",
    category: "Integrations & Gateways",
    description: "View payment connection statuses (Streamlabs, BMAC, Ko-fi).",
    bitmask: OrgPerm.INTEGRATION_VIEW.toString(),
  },
  {
    key: "INTEGRATION_MANAGE",
    name: "Manage Integrations",
    category: "Integrations & Gateways",
    description: "Connect or disconnect external payment relays and webhooks.",
    bitmask: OrgPerm.INTEGRATION_MANAGE.toString(),
  },

  // 40-49: Financials, Analytics & Logs
  {
    key: "ANALYTICS_VIEW",
    name: "View Analytics",
    category: "Analytics & Finance",
    description: "Access supporter metrics, tip velocity, and real-time graphs.",
    bitmask: OrgPerm.ANALYTICS_VIEW.toString(),
  },
  {
    key: "TRANSACTION_VIEW",
    name: "View Transactions",
    category: "Analytics & Finance",
    description: "Inspect raw donation logs, supporter notes, and payment amounts.",
    bitmask: OrgPerm.TRANSACTION_VIEW.toString(),
  },
  {
    key: "REPORT_EXPORT",
    name: "Export Financial Reports",
    category: "Analytics & Finance",
    description: "Export audit logs, donation CSVs, and revenue summaries.",
    bitmask: OrgPerm.REPORT_EXPORT.toString(),
  },
];

// Precomputed static system presets to avoid per-request iteration and bitmask allocations
export const SYSTEM_PRESETS = Object.entries(RolePresets).map(([role, mask]) => {
  const roleName = role.charAt(0) + role.slice(1).toLowerCase();
  const descriptions: Record<string, string> = {
    OWNER: "Full organization authority, financial control, and destruction rights.",
    ADMIN: "Administrative access across members, settings, and channels (cannot delete org).",
    MANAGER: "Operational authority over streamer profiles, widgets, alerts, and integrations.",
    EDITOR: "Creative authority to customize channel profiles and AlertBox visuals.",
    VIEWER: "Read-only visibility for auditing, analytics, and overlay previews.",
    MEMBER: "Standard team member with basic organization directory access.",
  };

  const grantedKeys = PERMISSION_DEFINITIONS.filter(
    (def) => (mask & BigInt(def.bitmask)) === BigInt(def.bitmask),
  ).map((def) => def.key);

  return {
    id: role,
    name: roleName,
    role: role as OrgRole,
    description: descriptions[role] ?? `${roleName} role with default permissions.`,
    permissions: mask.toString(),
    grantedKeys,
    isSystem: true,
  };
});

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/permissions",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_VIEW, set, "view organization");
      if (typeof authRes === "string") return authRes;
      const { orgId } = authRes;

      const customPresets = await listOrgRolePresets(orgId);

      return {
        definitions: PERMISSION_DEFINITIONS,
        presets: [...SYSTEM_PRESETS, ...customPresets],
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List all permissions and presets",
        description: "Returns the complete permission definition catalog, system role presets, and custom organization presets.",
      },
    },
  );
