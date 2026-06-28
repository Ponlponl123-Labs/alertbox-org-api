import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";
import { removeConnection } from "@/classes/me/connections";

const deleteHandler = async ({ headers, set, ip }: any) => {
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

  await removeConnection(user.data.id, "streamlabs");

  return "OK";
};

const deleteValidation = {
  headers: t.Object({
    authorization: t.String(),
  }),
};

export const endpoint = new Elysia().use(ip({ headersFirst: true }))
  .delete("/", deleteHandler, deleteValidation)
  .delete("", deleteHandler, deleteValidation);

export default endpoint;
