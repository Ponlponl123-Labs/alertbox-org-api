import { prisma, redis } from "@/index";
import { Connections } from "@/types/account.types";
import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";
import { connectionSecretSelect } from "@/consts/session";

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
      const user = await new Me().use(auth, ip);
      if (!user || !user.data) {
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
          id: user.data.id,
        },
      });
      void redis.redis.setex(
        `user:${user.data.id}:connections:${target}`,
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
      const user = await new Me().use(auth, ip);
      if (!user || !user.data) {
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
          id: user.data.id,
        },
      });
      void redis.redis.del(`user:${user.data.id}:connections:${target}`);
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
