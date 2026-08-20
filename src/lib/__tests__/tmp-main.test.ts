import { describe, it } from "vitest";
import { setMainImageUrl, moveImageFirst, normalizeRuImageTagMap, pruneRuImageTagMap, findMainImageUrl } from "@/lib/ruImageTags";
describe("main round trip", () => {
  it("works", () => {
    const images = ["a","b","c"];
    let tags = normalizeRuImageTagMap({ a: [1], b: [3] });
    const nextTags = setMainImageUrl(tags, images, "b");
    const nextImages = moveImageFirst(images, "b");
    const pruned = pruneRuImageTagMap(nextTags, nextImages);
    console.log({ nextTags, nextImages, pruned, main: findMainImageUrl(pruned, nextImages) });
  });
});
