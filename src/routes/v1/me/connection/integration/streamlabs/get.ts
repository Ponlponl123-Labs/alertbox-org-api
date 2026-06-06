import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";

export const endpoint = new Elysia()
  .use(ip())
  .get(
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
  )
  .get(
    "/oauth2",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me({ cache: false }).use(
        auth,
        ip,
        basicUserSelect,
      );
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      const redirect_uri =
        process.env.NODE_ENV === "production"
          ? "https://alertbox.org/app/connections/streamlabs"
          : "http://localhost:3000/app/connections/streamlabs";
      const oauth2Url = `https://streamlabs.com/api/v2.0/authorize?client_id=${process.env.STREAMLABS_CLIENT_ID}&redirect_uri=${redirect_uri}&scope=donations.create&response_type=code&state=${user.data.id}`;

      return oauth2Url;
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default endpoint;
