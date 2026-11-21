import Elysia from "elysia";
import { endpoint as ListEndpoint } from "../org/streamers/list";
import { endpoint as CreateEndpoint } from "../org/streamers/create";
import { endpoint as UpdateEndpoint } from "../org/streamers/update";
import { endpoint as RemoveEndpoint } from "../org/streamers/remove";
import { endpoint as IntegrationEndpoint } from "../org/streamers/integration/index";
import { endpoint as AuditEndpoint } from "../org/streamers/audit/index";
import { endpoint as TransactionsEndpoint } from "../org/streamers/transactions/index";
import { endpoint as TinyEndpoint } from "../org/streamers/tiny";
import { endpoint as CheckUsernameEndpoint } from "../org/streamers/check-username";
import { endpoint as PublishEndpoint } from "../org/streamers/publish";

export const StreamersRouter = new Elysia({ prefix: "/org" })
  .use(ListEndpoint)
  .use(CreateEndpoint)
  .use(UpdateEndpoint)
  .use(RemoveEndpoint)
  .use(IntegrationEndpoint)
  .use(AuditEndpoint)
  .use(TransactionsEndpoint)
  .use(TinyEndpoint)
  .use(CheckUsernameEndpoint)
  .use(PublishEndpoint);

export default StreamersRouter;
