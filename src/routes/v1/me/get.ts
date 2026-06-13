import Elysia from "elysia";
import { auth } from "@/core/auth";
import { sessionUserSelect } from "@/consts/session";

/**
 * GET endpoint to retrieve the currently logged in user's profile info.
 */
export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser(sessionUserSelect);
      return user.toJSON();
    }
  );

export default endpoint;
