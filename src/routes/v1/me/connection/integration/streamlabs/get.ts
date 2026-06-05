import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";

export const endpoint = new Elysia().use(ip()).get(
  "/",
  async ({ headers, set, ip }) => {
    const auth = isBearerToken(headers.authorization);
    if (!auth) {
      set.status = "Bad Request";
      return "Bad Request";
    }
    const user = await new Me({ cache: false }).use(auth, ip, {
      integration: {
        select: {
          streamlabsSecret: true,
          streamlabsOptions: true,
        },
      },
    });
    if (!user || !user.data) {
      set.status = "Unauthorized";
      return "Unauthorized";
    }

    return {
      isConnected: !!user.data.integration?.streamlabsSecret,
      options: user.data.integration?.streamlabsOptions ?? null,
    };
  },
  {
    headers: t.Object({
      authorization: t.String(),
    }),
  },
);

export default endpoint;
