import { describe, expect, it } from "vitest";
import { resolvePersistedRoomIdentity } from "./roomIdentity";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("resolvePersistedRoomIdentity", () => {
  it("keeps identity when a listed unit is renamed", () => {
    const row = { id: UUID, name: "Bosbok", isActive: false, listingId: "5808364" };
    expect(resolvePersistedRoomIdentity([row], { id: UUID, name: "Bosbok Lodge" }, new Set())).toEqual(row);
  });

  it("prefers the listed row among normalized-name mirrors", () => {
    const stale = { id: "a", name: " Galjoen ", isActive: true, listingId: null };
    const listed = { id: "b", name: "GALJOEN", isActive: false, listingId: "5806500" };
    expect(resolvePersistedRoomIdentity([stale, listed], { name: "Galjoen" }, new Set())?.id).toBe("b");
  });

  it("does not assign a claimed row twice", () => {
    const row = { id: "a", name: "Galjoen", isActive: true, listingId: "5806500" };
    expect(resolvePersistedRoomIdentity([row], { name: "Galjoen" }, new Set(["a"]))).toBeNull();
  });
});