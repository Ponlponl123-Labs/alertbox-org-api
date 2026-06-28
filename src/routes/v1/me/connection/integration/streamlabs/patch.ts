import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { prisma } from "@/core/prisma";

export const endpoint = new Elysia().use(ip({ headersFirst: true })).patch(
  "/",
  async ({ headers, set, ip, body }) => {
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
  },
  {
    headers: t.Object({
      authorization: t.String(),
    }),
    body: t.Object({
      options: t.Number(),
    }),
  },
);

export default endpoint;
