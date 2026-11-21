import Elysia from "elysia";
import { fetchEndpoint } from "./fetch";
import { toggleEndpoint } from "./toggle";
import { disconnectEndpoint } from "./disconnect";
import { streamlabsEndpoint } from "./streamlabs";
import { stripeEndpoint } from "./stripe";
import { bmacEndpoint } from "./buymeacoffee";
import { kofiEndpoint } from "./kofi";
import { feelfreepayEndpoint } from "./feelfreepay";
import { xenditEndpoint } from "./xendit";
import { fallbackEndpoint } from "./fallback";

const createIntegrationRoutes = () =>
  new Elysia()
    .use(streamlabsEndpoint)
    .use(stripeEndpoint)
    .use(bmacEndpoint)
    .use(kofiEndpoint)
    .use(feelfreepayEndpoint)
    .use(xenditEndpoint)
    .use(fallbackEndpoint)
    .use(fetchEndpoint)
    .use(toggleEndpoint)
    .use(disconnectEndpoint);

export const endpoint = new Elysia().group(
  "/:orgId/streamers/:streamerId/integration",
  (app) => app.use(createIntegrationRoutes()),
);

export default endpoint;
