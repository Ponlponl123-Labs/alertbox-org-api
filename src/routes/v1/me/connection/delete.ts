import Elysia, { t } from "elysia";
import {
  allowed_user_update_providers,
  resolveProvider,
} from "@/classes/me/connections";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";

/**
 * DELETE endpoint to remove integration configuration for a provider.
 */
export const endpoint = new Elysia().use(ip()).delete(
  "/:provider",
  async ({ headers, params, set, ip }) => {
    const provider = resolveProvider(params.provider ?? "");
    if (!provider || !allowed_user_update_providers.includes(provider)) {
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

export default endpoint;
