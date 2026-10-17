import Elysia, { t } from "elysia";
import { orgContext, requireOrgPermission } from "@/core/org";
import { OrgPerm } from "@/consts/permission";
import { prisma } from "@/core/prisma";

const patchValidation = {
  detail: {
    tags: ["Streamlabs Relay"],
    summary: "Update Streamlabs relay preferences",
    description:
      "Configures donation relay options (such as bitflags for automatic donation forwarding to Streamlabs).",
  },
  body: t.Object(
    {
      options: t.Integer({
        minimum: 0,
        maximum: 255,
        description: "Bitflag integer representing configured relay options.",
        examples: [1],
      }),
    },
    {
      description: "Streamlabs options payload.",
      examples: [{ options: 1 }],
    },
  ),
  response: {
    200: t.String({
      description: "Relay options updated.",
      examples: ["OK"],
    }),
  },
};

export const endpoint = new Elysia()
  .use(orgContext)
  .patch(
    "/",
    async ({ org, set, body }) => {
      if (!org) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      if (!requireOrgPermission(org, OrgPerm.INTEGRATION_MANAGE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to manage integrations";
      }

      await prisma.client.integration.update({
        where: {
          streamerId: org.streamerId,
        },
        data: {
          streamlabsOptions: body.options,
        },
      });

      return "OK";
    },
    patchValidation,
  );

export default endpoint;
