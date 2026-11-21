import Elysia from "elysia";
import { getOauthEndpoint } from "./getOauth";
import { connectEndpoint } from "./connect";

export const stripeEndpoint = new Elysia()
  .use(getOauthEndpoint)
  .use(connectEndpoint);

export default stripeEndpoint;
