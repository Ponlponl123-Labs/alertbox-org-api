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
      detail: {
        tags: ["User Security"],
        summary: "Revoke an active device session",
        description:
          "Immediately terminates a specific login session by its device/session ID. The session token is permanently invalidated in Redis and database, logging out that device.",
      },
      params: t.Object({
        id: t.String({
          description: "Device session ID to revoke.",
          examples: ["sess_dev_1a2b3c4d5e"],
        }),
      }),
      response: {
        200: t.String({
          description: "Device session revoked.",
          examples: ["OK"],
        }),
      },
    },
  );

export default endpoint;
