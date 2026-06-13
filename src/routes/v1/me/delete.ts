import Elysia from "elysia";
import { auth } from "@/core/auth";
import { sessionUserSelect } from "@/consts/session";

/**
 * DELETE endpoint to delete the currently logged in user's account.
 */
export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser(sessionUserSelect);
      await user.delete();
      return "OK, Goodbye!";
    }
  );

export default endpoint;
