import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
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
    let dbUser = await prisma.client.user.findUnique({
      where: { id: numericId },
      select: {
        id: true,
        type: true,
        name: true,
        email: true,
        avatar: true,
        createWith: true,
        createdAt: true,
        disabledAt: true,
        deletedAt: true,
      },
    });

    if ((!dbUser || dbUser.deletedAt) && orgId) {
      const member = await prisma.client.organizationMember.findFirst({
        where: { id: numericId, orgId, isDeleted: null },
        include: {
          user: {
            select: {
              id: true,
              type: true,
              name: true,
              email: true,
              avatar: true,
              createWith: true,
              createdAt: true,
              disabledAt: true,
              deletedAt: true,
            },
          },
        },
      });
      if (member?.user && !member.user.deletedAt) {
        dbUser = member.user;
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
