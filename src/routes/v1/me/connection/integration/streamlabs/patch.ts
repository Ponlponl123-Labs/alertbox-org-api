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
  headers: t.Object({
    authorization: t.String(),
  }),
  body: t.Object({
    options: t.Number(),
  }),
};

export const endpoint = new Elysia().use(ip({ headersFirst: true }))
  .patch("/", patchHandler, patchValidation)
  .patch("", patchHandler, patchValidation);

export default endpoint;
