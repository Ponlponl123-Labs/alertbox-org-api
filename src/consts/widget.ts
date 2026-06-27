import { Prisma } from "@/generated/prisma/client";

/**
 * Default events to seed for a newly created alertbox widget.
 */
export const DEFAULT_ALERTBOX_EVENTS: Prisma.AlertboxEventCreateManyAlertboxInput[] = [
  {
    eventType: "TIP",
    prefix: "{{user}} just donated ",
    subfix: "{{amount}}{{currency}}!",
    ttsEnabled: true,
    messageLayout: "image-above",
    animIn: "fade_in_up",
    animOut: "fade_out_up",
  },
  {
    eventType: "MEMBERSHIP",
    prefix: "{{user}} is now a",
    subfix: "member!",
    messageLayout: "image-above",
    animIn: "bounce_in",
    animOut: "bounce_out",
  },
  {
    eventType: "MERCH",
    prefix: "{{user}} bought",
    subfix: "from the shop!",
    messageLayout: "image-beside",
  },
  {
    eventType: "FOLLOW",
    prefix: "{{user}} is now",
    subfix: "following!",
    animIn: "slide_in_left",
    animOut: "slide_out_right",
  },
];
