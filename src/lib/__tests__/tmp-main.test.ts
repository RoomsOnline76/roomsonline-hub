import { describe, it, expect } from "vitest";
import { deriveChangedChannelFields } from "@/lib/channelPushFields";
describe("main photo", () => {
  it("property main photo swap", () => {
    const before = { images: ["a","b"], ru_image_tags: { a: [1] } };
    const after = { images: ["b","a"], ru_image_tags: { b: [1] } };
    console.log(deriveChangedChannelFields(before, after));
  });
  it("unit main photo swap", () => {
    const before = { amenities: { room_types: [{ id: "u1", images: ["a","b"], ruImageTags: { a: [1] } }] } };
    const after = { amenities: { room_types: [{ id: "u1", images: ["b","a"], ruImageTags: { b: [1] } }] } };
    console.log(deriveChangedChannelFields(before, after));
  });
});
