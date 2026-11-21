import Elysia from "elysia";
import { endpoint as ListEndpoint } from "./list";
import { endpoint as CreateEndpoint } from "./create";
import { endpoint as RevokeEndpoint } from "./revoke";
import { endpoint as LookupEndpoint } from "./lookup";
import { endpoint as VerifyEndpoint } from "./verify/verify";
import { endpoint as AcceptEndpoint } from "./accept/accept";

export const endpoint = new Elysia()
  .use(ListEndpoint)
  .use(CreateEndpoint)
  .use(RevokeEndpoint)
  .use(LookupEndpoint)
  .group("/invites", (app) =>
    app
      .use(VerifyEndpoint)
      .use(AcceptEndpoint),
  );

export default endpoint;
