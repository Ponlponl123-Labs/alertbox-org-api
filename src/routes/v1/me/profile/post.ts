import Elysia from "elysia";
import { prisma } from "@/core/prisma";
import { auth } from "@/core/auth";
import { sessionUserSelect, fullUserSelect } from "@/consts/session";
import { setCachedUser } from "@/classes/me/cache";

/**
 * POST endpoint to publish/activate the user profile.
 */
export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser(sessionUserSelect);

      await prisma.client.profile.update({
        data: {
          publishedAt: new Date(),
        },
        where: {
          userId: user.data.id,
        },
      });

      // Fetch full user for cache sync (must select fullUserSelect to maintain cache completeness)
      const fullUser = await prisma.client.user.findUnique({
        where: { id: user.data.id },
        select: fullUserSelect,
      });

      if (fullUser) {
        await setCachedUser(user.data.id, fullUser);
      }

      return "OK";
    }
  );

export default endpoint;
