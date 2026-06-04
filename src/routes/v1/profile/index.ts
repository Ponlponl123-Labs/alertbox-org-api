import { isValidUri } from "@/utils/regex";
import Elysia, { t } from "elysia";

import { Me } from "@/classes/me";

export const router = new Elysia({ prefix: "profile" })
  .get(
    "/:uri",
    async ({ params, set }) => {
      const parsedUri = String(params.uri ?? "")
        .trim()
        .toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      if (await Me.getURIOwner(parsedUri)) return "OK";
      set.status = "Not Found";
      return "Not Found";
    },
    {
      params: t.Object({
        uri: t.String(),
      }),
    },
  )
  .get(
    "/:uri/details",
    async ({ params, set }) => {
      const parsedUri = String(params.uri ?? "")
        .trim()
        .toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const owner = await Me.getURIOwner(parsedUri);
      if (!owner) {
        set.status = "Not Found";
        return "Not Found";
      }

      const user = await new Me().load(owner, {
        profile: true,
        disabledAt: true,
        deletedAt: true,
      });

      if (!user || !user.data || !user.data.profile) {
        set.status = "Not Found";
        return "Not Found";
      }

      if (!user.data.profile.publishedAt || user.data.disabledAt || user.data.deletedAt) {
        set.status = "Forbidden";
        return "Forbidden";
      }

      // Exclude userId from the returned profile data
      const { userId: _, ...publicProfile } = user.data.profile;
      return publicProfile;
    },
    {
      params: t.Object({
        uri: t.String(),
      }),
    },
  );

export default router;
