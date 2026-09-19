import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { prisma } from "@/core/prisma";

const patchHandler = async ({ headers, set, ip, body }: any) => {
  const auth = isBearerToken(headers.authorization);
  if (!auth) {
    set.status = "Bad Request";
    return "Bad Request";
  }
  const user = await new Me().use(auth, ip, { id: true });
  if (!user || !user.data) {
    set.status = "Unauthorized";
    return "Unauthorized";
  }

  await prisma.client.integration.update({
    where: {
      userId: user.data.id,
    },
    data: {
      streamlabsOptions: body.options,
    },
  });

  return "OK";
};

const patchValidation = {
  detail: {
    tags: ["Streamlabs Relay"],
    summary: "Update Streamlabs relay preferences",
    description:
      "Configures donation relay options (such as bitflags for automatic donation forwarding to Streamlabs).",
  },
  headers: t.Object({
    authorization: t.String({
      description: "Bearer session token.",
      examples: ["Bearer ab_sess_123456"],
    }),
  }),
  body: t.Object(
    {
      options: t.Number({
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

export const endpoint = new Elysia().use(ip({ headersFirst: true }))
  .patch("/", patchHandler, patchValidation)
  .patch("", patchHandler, { ...patchValidation, detail: { ...patchValidation.detail, hide: true } });

export default endpoint;
