import { prisma, redis } from "@/index";
import { Connections } from "@/types/account.types";
import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";

export const supported_providers = [
  "stripe",
  "buymeacoffee",
  "kofi",
  "feelfreepay",
];

export const providerAliases: Record<string, string> = {
  bmac: "buymeacoffee",
  ffp: "feelfreepay",
};

const endpoint = new Elysia({ prefix: "/device" })
  .use(ip())
  .get(
    "/",
    async ({ headers, set, ip }) => {
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
      const devicesRaw = await prisma.client.sessions.findMany({
        select: {
          id: true,
          time: true,
          disabled: true,
          expire: true,
          ip_addr: true,
          user_agent: true,
          platform: true,
          platform_major: true,
          platform_ver: true,
          platform_type: true,
          cpu_architecture: true,
          device_model: true,
          device_type: true,
          device_vendor: true,
          ip_addr_asn: true,
          ip_addr_city: true,
          ip_addr_continent_code: true,
          ip_addr_country: true,
          ip_addr_country_code: true,
          ip_addr_country_code_iso3: true,
          ip_addr_isp: true,
          ip_addr_lat: true,
          ip_addr_long: true,
          ip_addr_postal: true,
          ip_addr_region: true,
          ip_addr_region_code: true,
          session_usages: {
            select: {
              time: true,
            },
            orderBy: {
              id: "desc",
            },
            take: 1,
          },
          os: true,
          os_ver: true,
          secret: false,
          token: true,
        },
        where: {
          uid: user.data.id,
          AND: {
            disabled: null,
            AND: {
              // and is not expired
              expire: {
                gt: new Date(),
              },
            },
          },
        },
      });

      const devices = devicesRaw.map(({ session_usages, ...rest }) => ({
        ...rest,
        token: undefined,
        last_used: session_usages?.[0]?.time ?? null,
        isThisDevice: rest.token === auth,
      }));

      return devices;
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ headers, set, ip, params }) => {
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
      try {
        const result = await prisma.client.sessions.updateMany({
          data: {
            disabled: new Date(),
          },
          where: {
            id: BigInt(String(params.id)),
            uid: user.data.id,
          },
        });
        if (result.count === 0) {
          set.status = "Bad Request";
          return "Bad Request";
        }
      } catch (e) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      return "OK";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
      params: t.Object({
        id: t.String(),
      }),
    },
  );

export { endpoint };
