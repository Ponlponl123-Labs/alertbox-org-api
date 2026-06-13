import Elysia from "elysia";
import { auth } from "@/core/auth";

/**
 * Endpoint to handle user session destruction (logout).
 */
export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser();
      await user.session.destroy();
      return "OK";
    }
  );

export default endpoint;
