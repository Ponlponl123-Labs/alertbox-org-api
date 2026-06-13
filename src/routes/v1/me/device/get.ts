import Elysia from "elysia";
import { auth } from "@/core/auth";

/**
 * GET endpoint to list all devices registered under the currently logged in user session.
 */
export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser();
      return user.devices.list();
    }
  );

export default endpoint;
