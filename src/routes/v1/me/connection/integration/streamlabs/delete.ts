import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";
import { removeConnection } from "@/classes/streamer";
import { db } from "@/db";

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

  const streamerRow = await db
    .selectFrom("OrganizationMember")
    .innerJoin("Streamer", "Streamer.orgId", "OrganizationMember.orgId")
    .select("Streamer.id as streamerId")
    .where("OrganizationMember.userId", "=", Number(user.data.id))
    .where("OrganizationMember.isDeleted", "is", null)
    .where("Streamer.deletedAt", "is", null)
    .orderBy("Streamer.createdAt", "asc")
    .executeTakeFirst();

  const streamerId = streamerRow ? streamerRow.streamerId : user.data.id;

  await removeConnection(streamerId, "streamlabs");

  return "OK";
};

const deleteValidation = {
  detail: {
    tags: ["Streamlabs Relay"],
    summary: "Disconnect Streamlabs integration",
    description:
      "Revokes the Streamlabs connection, clearing access and refresh tokens from the database. Automatic donation forwarding will cease immediately.",
  },
  headers: t.Object({
    authorization: t.String({
      description: "Bearer session token.",
      examples: ["Bearer ab_sess_123456"],
    }),
  }),
  response: {
    200: t.String({
      description: "Streamlabs disconnected.",
      examples: ["OK"],
    }),
  },
};

export const endpoint = new Elysia().use(ip({ headersFirst: true }))
  .delete("/", deleteHandler, deleteValidation)
  .delete("", deleteHandler, { ...deleteValidation, detail: { ...deleteValidation.detail, hide: true } });

export default endpoint;
