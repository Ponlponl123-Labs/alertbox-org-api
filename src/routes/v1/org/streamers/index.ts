import Elysia from "elysia";
import { endpoint as ListEndpoint } from "./list";
import { endpoint as CreateEndpoint } from "./create";
import { endpoint as UpdateEndpoint } from "./update";
import { endpoint as RemoveEndpoint } from "./remove";
import { endpoint as IntegrationEndpoint } from "./integration/index";
import { endpoint as AuditEndpoint } from "./audit/index";
import { endpoint as TransactionsEndpoint } from "./transactions/index";
import { endpoint as TinyEndpoint } from "./tiny";
import { endpoint as CheckUsernameEndpoint } from "./check-username";
import { endpoint as PublishEndpoint } from "./publish";
import { endpoint as ViolationsEndpoint } from "./violations";

export const endpoint = new Elysia()
  .use(ListEndpoint)
  .use(CreateEndpoint)
  .use(UpdateEndpoint)
  .use(RemoveEndpoint)
  .use(IntegrationEndpoint)
  .use(AuditEndpoint)
  .use(TransactionsEndpoint)
  .use(TinyEndpoint)
  .use(CheckUsernameEndpoint)
  .use(PublishEndpoint)
  .use(ViolationsEndpoint);

export default endpoint;
