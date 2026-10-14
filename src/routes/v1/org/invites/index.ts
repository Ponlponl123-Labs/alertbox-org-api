import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as PostEndpoint } from "./post";
import { endpoint as DeleteEndpoint } from "./delete";
import { endpoint as VerifyEndpoint } from "./verify/post";
import { endpoint as AcceptEndpoint } from "./accept/post";

export const endpoint = new Elysia()
  .use(GetEndpoint)
  .use(PostEndpoint)
  .use(DeleteEndpoint)
  .group("/invites", (app) =>
    app
      .use(VerifyEndpoint)
      .use(AcceptEndpoint),
  );

export default endpoint;
