import { WebhookDispatcher } from "./dispatcher";
import { KofiWebhook } from "./kofi";
import { BmacWebhook } from "./bmac";

export class Webhook {
  public static readonly kofi = KofiWebhook;
  public static readonly bmac = BmacWebhook;
  public static readonly dispatcher = WebhookDispatcher;

  public static readonly log = WebhookDispatcher.logWebhook.bind(WebhookDispatcher);
  public static readonly processDonation = WebhookDispatcher.processDonation.bind(WebhookDispatcher);
  public static readonly dispatchAlerts = WebhookDispatcher.dispatchAlerts.bind(WebhookDispatcher);
  public static readonly relayStreamlabs = WebhookDispatcher.relayStreamlabs.bind(WebhookDispatcher);
}
