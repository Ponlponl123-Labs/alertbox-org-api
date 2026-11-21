import Elysia from "elysia";
import { fetchEndpoint } from "./fetch";
import { getOauthEndpoint } from "./getOauth";
import { logsEndpoint } from "./logs";
import { connectEndpoint } from "./connect";
import { optionsEndpoint } from "./options";
import { disconnectEndpoint } from "./disconnect";
import { wsEndpoint } from "./ws";

export const streamlabsEndpoint = new Elysia()
  .use(fetchEndpoint)
  .use(getOauthEndpoint)
  .use(logsEndpoint)
  .use(connectEndpoint)
  .use(optionsEndpoint)
  .use(disconnectEndpoint)
  .use(wsEndpoint);

export default streamlabsEndpoint;
