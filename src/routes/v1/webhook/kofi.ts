import Elysia, { t } from "elysia";
import { Webhook } from "@/classes/webhook";

export const endpoint = new Elysia().post(
  "/kofi",
  async ({ body, set }: any) => {
    const res = await Webhook.kofi.handle(body);
    set.status = res.status;
    return res.body;
  },
  {
    body: t.Object({}, { additionalProperties: true }),
  },
);

export default endpoint;
