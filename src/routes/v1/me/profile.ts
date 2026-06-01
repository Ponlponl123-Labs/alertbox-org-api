import Elysia, { t } from "elysia";

export const endpoint = new Elysia({ prefix: "profile" }).get(
  "/",
  async () => {
    return "OK";
  },
  {
    headers: t.Object({
      authorization: t.String(),
    }),
  },
);

export default endpoint;
