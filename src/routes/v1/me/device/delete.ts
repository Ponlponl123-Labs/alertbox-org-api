import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";

/**
 * DELETE endpoint to destroy a registered device.
 */
export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:id",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const success = await user.devices.destroy(params.id);
      if (!success) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      return "OK";
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    },
  );

export default endpoint;
