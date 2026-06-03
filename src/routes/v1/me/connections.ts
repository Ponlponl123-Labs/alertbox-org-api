import { prisma, redis } from "@/index";
import { Connections } from "@/types/account.types";
import { useSession } from "@/utils/account/session";
import { isBearerToken } from "@/utils/bearer-token";
import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";

export const supported_providers = [
  "stripe",
  "buymeacoffee",
  "kofi",
  "feelfreepay",
  "streamlabs",
];

export const providerAliases: Record<string, string> = {
  bmac: "buymeacoffee",
  ffp: "feelfreepay",
};

import { accounts } from "@/generated/prisma/client";

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
      const me = (await useSession(auth, ip, false)) as accounts | null | false;
      if (!me) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      return {
        stripe: me.stripe_secret ?? null,
        bmac: me.bmac_secret ?? null,
        kofi: me.kofi_secret ?? null,
        ffp: me.ffp_secret ?? null,
        youtube: null,
        facebook: null,
        twitch: null,
        patreon: null,
        streamlabs: me.streamlabs_secret ?? null,
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
      const rawProvider = String(params.provider ?? "").toLowerCase();
      const provider = (providerAliases[rawProvider] ?? rawProvider) as string;

      if (!supported_providers.includes(provider)) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      const target: (typeof supported_providers)[number] = provider;
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
          stripe_secret: target === "stripe" ? body : undefined,
          bmac_secret: target === "buymeacoffee" ? body : undefined,
          kofi_secret: target === "kofi" ? body : undefined,
          ffp_secret: target === "feelfreepay" ? body : undefined,
          streamlabs_secret: target === "streamlabs" ? body : undefined,
        },
        where: {
          id: me.id,
        },
      });
      void redis.redis.setex(
        `user:${me.id}:connections:${target}`,
        24 * 60 * 60 * 1000,
        body,
      );
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
      const rawProvider = String(params.provider ?? "").toLowerCase();
      const providerAliases: Record<string, string> = {
        bmac: "buymeacoffee",
        ffp: "feelfreepay",
      };
      const provider = (providerAliases[rawProvider] ?? rawProvider) as string;

      if (!supported_providers.includes(provider)) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      const target: (typeof supported_providers)[number] = provider;
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
          stripe_secret: target === "stripe" ? null : undefined,
          bmac_secret: target === "buymeacoffee" ? null : undefined,
          kofi_secret: target === "kofi" ? null : undefined,
          ffp_secret: target === "feelfreepay" ? null : undefined,
          streamlabs_secret: target === "streamlabs" ? null : undefined,
        },
        where: {
          id: me.id,
        },
      });
      void redis.redis.del(`user:${me.id}:connections:${target}`);
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
