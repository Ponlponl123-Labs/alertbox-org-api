import Elysia from "elysia";
import { endpoint as DeviceEndpoint } from "./device/index";
import { endpoint as ProfileEndpoint } from "./profile/index";
import { endpoint as FetchEndpoint } from "./fetch";
import { endpoint as UpdateEndpoint } from "./update";
import { endpoint as DeleteAccountEndpoint } from "./delete-account";

export const router = new Elysia({ prefix: "me" })
  .use(DeviceEndpoint)
  .use(ProfileEndpoint)
  .use(FetchEndpoint)
  .use(UpdateEndpoint)
  .use(DeleteAccountEndpoint);

export default router;
