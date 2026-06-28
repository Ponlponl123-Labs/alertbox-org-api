import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";
import { setConnection } from "@/classes/me/connections";
import { streamlabs_redirect_uri } from "@/consts/integration";

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
      redirect_uri: streamlabs_redirect_uri,
      code: body,
    } as any),
  });

  const data = await r.json();

  if (!r.ok || !data.access_token) {
    set.status = "Bad Request";
    return "Bad Request";
  }

  await setConnection(user.data.id, "streamlabs", data.access_token);

  return "OK";
};

const postValidation = {
  headers: t.Object({
    authorization: t.String(),
  }),
  body: t.String(),
};

export const endpoint = new Elysia().use(ip({ headersFirst: true }))
  .post("/", postHandler, postValidation)
  .post("", postHandler, postValidation);

export default endpoint;
