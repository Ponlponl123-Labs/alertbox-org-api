import Elysia from "elysia";
import { auth } from "@/core/auth";
import { authorizeIntegrationManage, integrationProviderParamsSchema, integrationSchema } from "./common";

export const fallbackEndpoint = new Elysia()
  .use(auth)
  .get(
    "/:provider/oauth2",
    async ({ getAuthenticatedUser, params, set }) => {
      const { error } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
        "configure integrations",
      );
      if (error) return error;

      set.status = "Bad Request";
      return "Provider does not support OAuth2";
    },
    {
      params: integrationProviderParamsSchema,
      detail: {
        tags: ["Organizations"],
        summary: "Fallback OAuth2 endpoint",
        description: "Returns 400 Bad Request for providers not supporting OAuth2.",
      },
    },
  )
  .post(
    "/:provider",
    async ({ getAuthenticatedUser, params, set }) => {
      const { error } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
      );
      if (error) return error;

      set.status = "Bad Request";
      return "Not supported provider";
    },
    {
      params: integrationProviderParamsSchema,
      detail: {
        tags: ["Organizations"],
        summary: "Fallback connect endpoint",
        description: "Returns 400 Bad Request for unsupported providers.",
      },
      body: integrationSchema,
    },
  );

export default fallbackEndpoint;
