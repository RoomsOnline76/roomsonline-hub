import { describe, expect, it } from "vitest";

import {
  CHANNEL_LISTING_NAME_MAX,
  CHANNEL_LISTING_NAME_MIN,
  checkChannelListingNameLength,
  isChannelListingNameLengthOk,
} from "@/lib/channelFieldRules";

describe("sales-channel listing name length", () => {
  it("allows a name at the 3-character minimum and refuses one below it", () => {
    expect(CHANNEL_LISTING_NAME_MIN).toBe(3);
    expect(isChannelListingNameLengthOk("Sea")).toBe(true);
    expect(isChannelListingNameLengthOk("Se")).toBe(false);
    expect(checkChannelListingNameLength("Se").status).toBe("warn");
    expect(checkChannelListingNameLength("Se").issue).toContain("at least 3");
  });

  it("still refuses a name over the 50-character maximum", () => {
    expect(CHANNEL_LISTING_NAME_MAX).toBe(50);
    expect(isChannelListingNameLengthOk("A".repeat(50))).toBe(true);
    expect(isChannelListingNameLengthOk("A".repeat(51))).toBe(false);
  });

  it("tells the owner the published window is 3–50 characters", () => {
    expect(checkChannelListingNameLength("Sea").requirement).toContain("3–50 characters");
    expect(checkChannelListingNameLength("A".repeat(60)).issue).toContain("at most 50");
  });
});
