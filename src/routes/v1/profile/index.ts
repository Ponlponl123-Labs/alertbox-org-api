import Elysia, { t } from "elysia";

export const router = new Elysia({ prefix: "profile" }).get(
  "/:uri",
  async () => {
    return "OK";
  },
  {
    params: t.Object({
      uri: t.String(),
    }),
  },
);

export default router;
