import { useSession } from "@/utils/account/session";
import { isBearerToken } from "@/utils/bearer-token";
import {
  endpoint as ConnectionEndpoint,
  supported_providers,
} from "./connections";
import { endpoint as DeviceEndpoint } from "./device";
import { endpoint as ProfileEndpoint } from "./profile";
import Elysia, { t } from "elysia";
import { prisma, redis } from "@/index";

export const router = new Elysia({ prefix: "me" })
  .use(ConnectionEndpoint)
  .use(DeviceEndpoint)
  .use(ProfileEndpoint)
  .get(
    "/",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const me = await useSession(auth, ip);
      if (!me) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      return me;
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  )
  .delete(
    "/",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const me = await useSession(auth, ip);
      if (!me) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      await prisma.client.accounts.update({
        data: {
          deleted: new Date(),
        },
        where: {
          id: me.id,
        },
      });
      await redis.redis.del(`user:${me.id}:info`);
      await redis.redis.del(`email:${me.email}`);
      supported_providers.forEach(async (provider) => {
        await redis.redis.del(`user:${me.id}:connections:${provider}`);
      });
      return "OK, Goodbye!";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default router;
