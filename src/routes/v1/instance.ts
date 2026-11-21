import Elysia, { t } from "elysia";
import { isAlertboxProduction } from "@/utils/instance";

export const instanceEndpoint = new Elysia({ prefix: "/instance" })
  .get(
    "/",
    ({ set }) => {
      if (isAlertboxProduction()) {
        set.status = 200;
        return "OK";
      }
      set.status = 404;
      return "Not Found";
    },
    {
      detail: {
        tags: ["System"],
        summary: "Check if running AlertBox.org production instance",
        description: "Returns 200 OK if official AlertBox.org instance, 404 if self-hosted.",
      },
      response: {
        200: t.String({ description: "Official production deployment instance indicator", examples: ["OK"] }),
        404: t.String({ description: "Self-hosted deployment instance indicator", examples: ["Not Found"] }),
      },
    },
  );

export default instanceEndpoint;
