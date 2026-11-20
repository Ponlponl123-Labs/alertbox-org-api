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
  let numericId = parseBigIntParam(userIdStr);
  if (!numericId) return null;

  if (orgId) {
    const isMember = await db
      .selectFrom("OrganizationMember")
      .select("userId")
      .where("orgId", "=", Number(orgId))
      .where("userId", "=", Number(numericId))
      .where("isDeleted", "is", null)
      .executeTakeFirst();

    if (!isMember) {
      const memberById = await db
        .selectFrom("OrganizationMember")
        .select("userId")
        .where("orgId", "=", Number(orgId))
        .where("id", "=", Number(numericId))
        .where("isDeleted", "is", null)
        .executeTakeFirst();
      if (!memberById) {
        return null;
      }
      numericId = BigInt(memberById.userId);
    }
  }

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
    const dbUser = await db
      .selectFrom("User")
      .select(["id", "type", "name", "email", "avatar", "createWith", "createdAt", "disabledAt", "deletedAt"])
      .where("id", "=", Number(numericId))
      .executeTakeFirst();

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
        description: "Fetch cached lightweight user profile (id, name, email, avatar) scoped strictly to members of this organization.",
      },
      params: t.Object({
        orgId: t.String(),
        userId: t.String(),
      }),
    },
  );

export default endpoint;
