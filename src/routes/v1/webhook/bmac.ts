import Elysia, { t } from "elysia";

// Development...

export const endpoint = new Elysia().post(
  "/bmac",
  async ({ set }) => {
    set.status = "Not Implemented";
    return "Not Implemented";
  },
  {
    body: t.Object({
      messageId: t.String(),
      timestamp: t.String(),
      donation: t.Object({
        id: t.String(),
        name: t.String(),
        amount: t.String(),
        currency: t.String(),
        comment: t.Optional(t.String()),
        email: t.Optional(t.String()),
      }),
    }),
  },
);

export default endpoint;
