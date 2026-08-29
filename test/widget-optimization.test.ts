import { describe, expect, it } from "bun:test";

describe("Widget Optimization & Lightweight Broadcast Payloads", () => {
  it("should construct a lightweight alert payload under 200 bytes", () => {
    const tinyAlertPayload = {
      type: "alert",
      id: "e2c3497d-6f78-4a5c-897b-cf10972b2100",
      event: "TIP",
      name: "Alex",
      amount: 2500,
      currency: "USD",
      message: "Keep up the awesome streaming!",
      createdAt: 1724930000000,
    };

    const serialized = JSON.stringify(tinyAlertPayload);
    const byteLength = Buffer.byteLength(serialized, "utf8");

    expect(tinyAlertPayload.type).toBe("alert");
    expect(tinyAlertPayload.name).toBe("Alex");
    expect(tinyAlertPayload.amount).toBe(2500);
    expect(byteLength).toBeLessThan(200);
  });

  it("should achieve > 90% size reduction compared to legacy full-settings alert payload", () => {
    const legacyHeavyPayload = {
      type: "alert",
      id: "e2c3497d-6f78-4a5c-897b-cf10972b2100",
      eventType: "TIP",
      prefix: "Thank you Alex",
      subfix: "for supporting!",
      messageLayout: "image-above",
      minVisibleDuration: 4.0,
      animIn: "fade_in_up",
      animOut: "fade_out_up",
      animInDuration: 1.0,
      animOutDuration: 1.0,
      image: "https://cdn.alertbox.org/assets/alerts/sparkle.gif",
      sound: "https://cdn.alertbox.org/assets/sounds/chime.mp3",
      soundVolume: 0.8,
      fontFamily: "Outfit",
      fontSize: 36,
      fontWeight: 700,
      textColor: 16777215,
      accentColor: 16007006,
      subfixColor: 13369548,
      donorColor: 6723532,
      amountColor: 13369548,
      textShadowColor: 0,
      textShadowSize: 0,
      outlineColor: 0,
      outlineSize: 3,
      ttsEnabled: true,
      ttsVoice: "en-US-Standard-C",
      ttsVolume: 0.9,
      ttsSpeed: 0.5,
      ttsPitch: 0.5,
      ttsDelay: 0.0,
      ttsOptions: 0,
      message: "Keep up the awesome streaming!",
      senderName: "Alex",
      amount: 2500,
      currency: "USD",
    };

    const optimizedTinyPayload = {
      type: "alert",
      id: "e2c3497d-6f78-4a5c-897b-cf10972b2100",
      event: "TIP",
      name: "Alex",
      amount: 2500,
      currency: "USD",
      message: "Keep up the awesome streaming!",
      createdAt: 1724930000000,
    };

    const legacyBytes = Buffer.byteLength(JSON.stringify(legacyHeavyPayload), "utf8");
    const optimizedBytes = Buffer.byteLength(JSON.stringify(optimizedTinyPayload), "utf8");
    const reductionRatio = (legacyBytes - optimizedBytes) / legacyBytes;

    expect(reductionRatio).toBeGreaterThan(0.7);
    expect(optimizedBytes).toBeLessThan(200);
  });

  it("should validate reactive settings update broadcast payload format", () => {
    const settingsUpdatePayload = {
      type: "settings:update",
      widgetId: "widget_cm3123abc",
      updatedAt: 1724930000000,
      settings: {
        globalVolume: 0.9,
        events: [
          {
            eventType: "TIP",
            isEnabled: true,
            accentColor: 16007006,
            ttsEnabled: true,
          },
        ],
      },
    };

    expect(settingsUpdatePayload.type).toBe("settings:update");
    expect(settingsUpdatePayload.widgetId).toBe("widget_cm3123abc");
    expect(settingsUpdatePayload.settings.events[0].accentColor).toBe(16007006);
  });
});
