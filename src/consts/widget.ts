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
    messageLayout: 0,
    animIn: 0,
    animOut: 1,
  },
  {
    eventType: "MEMBERSHIP",
    prefix: "{{user}} is now a",
    subfix: "member!",
    messageLayout: 0,
    animIn: 2,
    animOut: 3,
  },
  {
    eventType: "MERCH",
    prefix: "{{user}} bought",
    subfix: "from the shop!",
    messageLayout: 1,
  },
  {
    eventType: "FOLLOW",
    prefix: "{{user}} is now",
    subfix: "following!",
    messageLayout: 1,
    animIn: 6,
    animOut: 7,
  },
];
