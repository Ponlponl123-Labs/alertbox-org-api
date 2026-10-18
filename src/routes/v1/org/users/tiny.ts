import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { authorizeOrg, parseBigIntParam } from "@/core/org";
import { OrgPerm } from "@/consts/permission";
import { getCachedUser, setCachedUser } from "@/classes/me/cache";

import { redis } from "@/core/redis";

export interface TinyUserResponse {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
}

export async function getTinyUser(userIdStr: string, orgId?: bigint | null): Promise<TinyUserResponse | null> {
  if (!/^\d+$/.test(userIdStr)) return null;
  const numericId = parseBigIntParam(userIdStr);
  if (!numericId) return null;

  const cached = await getCachedUser(numericId);
  if (cached === "deleted") return null;
  if (cached) {
    return {
      id: String(cached.id),
      name: cached.name ?? null,
      email: cached.email ?? "",
      avatar: cached.avatar ?? null,
    };
  }

  try {
    let dbUser = await db
      .selectFrom("User")
      .select(["id", "type", "name", "email", "avatar", "createWith", "createdAt", "disabledAt", "deletedAt"])
      .where("id", "=", Number(numericId))
      .executeTakeFirst();

    if ((!dbUser || dbUser.deletedAt) && orgId) {
      const memberUser = await db
        .selectFrom("OrganizationMember")
        .innerJoin("User", "User.id", "OrganizationMember.userId")
        .select([
          "User.id",
          "User.type",
          "User.name",
          "User.email",
          "User.avatar",
          "User.createWith",
          "User.createdAt",
          "User.disabledAt",
          "User.deletedAt",
        ])
        .where("OrganizationMember.id", "=", Number(numericId))
        .where("OrganizationMember.orgId", "=", Number(orgId))
        .where("OrganizationMember.isDeleted", "is", null)
        .executeTakeFirst();

      if (memberUser && !memberUser.deletedAt) {
        dbUser = memberUser;
      }
    }

    if (!dbUser || dbUser.deletedAt) {
      await redis.redis.setex("user:" + numericId.toString() + ":info", 300, "deleted");
      return null;
    }

    await setCachedUser(dbUser.id, dbUser);

    return {
      id: String(dbUser.id),
      name: dbUser.name ?? null,
      email: dbUser.email ?? "",
      avatar: dbUser.avatar ?? null,
    };
  } catch {
    return null;
  }
}

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/users/:userId/tiny",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_VIEW, set, "view user details");
      if (typeof authRes === "string") return set.status === "Forbidden" ? "Access denied" : authRes;
      const { orgId } = authRes;

      const tiny = await getTinyUser(params.userId, orgId);
      if (!tiny) {
        set.status = "Not Found";
        return "User not found";
      }

      return tiny;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get tiny user profile",
        description: "Fetch cached lightweight user profile (id, name, email, avatar) using canonical user:{id}:info cache.",
      },
      params: t.Object({
        orgId: t.String(),
        userId: t.String(),
      }),
    },
  );

export default endpoint;
