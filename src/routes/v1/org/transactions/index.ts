import Elysia from "elysia";
import { endpoint as ActivityEndpoint } from "./activity";
import { endpoint as AnalyticsEndpoint } from "./analytics";

export const endpoint = new Elysia()
  .use(ActivityEndpoint)
  .use(AnalyticsEndpoint);

export default endpoint;
