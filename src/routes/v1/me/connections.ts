import { Connections } from "@/types/account.types";
import { Me } from "@/classes/me";
import { resolveProvider } from "@/classes/me/connections";
import { isBearerToken } from "@/utils/bearer-token";
import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";
import { connectionSecretSelect } from "@/consts/session";

const endpoint = new Elysia({ prefix: "/connection" })
  .use(ip())
  .get(
    "/",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me({ cache: false }).use(
        auth,
        ip,
        connectionSecretSelect,
      );
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      return {
        stripe: user.data.stripe_secret ?? null,
        bmac: user.data.bmac_secret ?? null,
        kofi: user.data.kofi_secret ?? null,
        ffp: user.data.ffp_secret ?? null,
        youtube: null,
        facebook: null,
        twitch: null,
        patreon: null,
        streamlabs: user.data.streamlabs_secret ?? null,
      } as Connections;
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  )
  .post(
    "/:provider",
    async ({ headers, params, body, set, ip }) => {
      const provider = resolveProvider(params.provider ?? "");
      if (!provider) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me().use(auth, ip);
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      
      await user.connections.set(provider, body);
      return "OK";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
      params: t.Object({
        provider: t.String(),
      }),
      body: t.String(),
    },
  )
  .delete(
    "/:provider",
    async ({ headers, params, set, ip }) => {
      const provider = resolveProvider(params.provider ?? "");
      if (!provider) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me().use(auth, ip);
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      await user.connections.remove(provider);
      return "OK";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
      params: t.Object({
        provider: t.String(),
      }),
    },
  );

export { endpoint };
