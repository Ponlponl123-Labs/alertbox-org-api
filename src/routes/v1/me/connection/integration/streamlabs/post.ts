import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";
import { setConnection } from "@/classes/me/connections";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";

const postHandler = async ({ headers, set, ip, body }: any) => {
  const auth = isBearerToken(headers.authorization);
  if (!auth) {
    set.status = "Bad Request";
    return "Bad Request";
  }
  const user = await new Me().use(auth, ip, basicUserSelect);
  if (!user || !user.data) {
    set.status = "Unauthorized";
    return "Unauthorized";
  }

  const r = await fetch("https://streamlabs.com/api/v2.0/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.STREAMLABS_CLIENT_ID!,
      client_secret: process.env.STREAMLABS_CLIENT_SECRET!,
      redirect_uri: integrationRedirectUri[ConnectionProvider.STREAMLABS],
      code: body,
    } as any),
  });

  const data = await r.json();

  if (!r.ok || !data.access_token) {
    set.status = "Bad Request";
    return "Bad Request";
  }

  await setConnection(user.data.id, "streamlabs", {
    secret: data.access_token,
    refreshToken: data.refresh_token || null,
  });

  return "OK";
};

const postValidation = {
  detail: {
    tags: ["Streamlabs Relay"],
    summary: "Connect Streamlabs account via authorization code",
    description:
      "Exchanges the Streamlabs OAuth2 authorization `code` with Streamlabs API for access and refresh tokens, linking Streamlabs to the creator account.",
  },
  headers: t.Object({
    authorization: t.String({
      description: "Bearer session token.",
      examples: ["Bearer ab_sess_123456"],
    }),
  }),
  body: t.String({
    description: "Streamlabs authorization code from the OAuth redirect query.",
    examples: ["sl_code_9a8b7c6d5e"],
  }),
  response: {
    200: t.String({
      description: "Streamlabs connected successfully.",
      examples: ["OK"],
    }),
  },
};

export const endpoint = new Elysia().use(ip({ headersFirst: true }))
  .post("/", postHandler, postValidation)
  .post("", postHandler, { ...postValidation, detail: { ...postValidation.detail, hide: true } });

export default endpoint;
