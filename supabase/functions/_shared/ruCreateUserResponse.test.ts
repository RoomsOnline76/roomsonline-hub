import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseRuCreatedUserIdentity } from "./ruCreateUserResponse.ts";

Deno.test("Push_CreateUser_RS captures the returned account as the new OwnerID", () => {
  const result = parseRuCreatedUserIdentity(
    '<Push_CreateUser_RS><Status ID="0">Success</Status><ResponseID>abc</ResponseID><UserAccountId>742620</UserAccountId></Push_CreateUser_RS>',
  );

  assertEquals(result, { userAccountId: "742620", ownerId: "742620" });
});

Deno.test("Push_CreateUser_RS accepts the alternate ID casing", () => {
  const result = parseRuCreatedUserIdentity(
    '<Push_CreateUser_RS><Status ID="0">Success</Status><UserAccountID>742621</UserAccountID></Push_CreateUser_RS>',
  );

  assertEquals(result, { userAccountId: "742621", ownerId: "742621" });
});

Deno.test("a successful create response without an account ID stays pending", () => {
  const result = parseRuCreatedUserIdentity(
    '<Push_CreateUser_RS><Status ID="0">Success</Status><ResponseID>abc</ResponseID></Push_CreateUser_RS>',
  );

  assertEquals(result, { userAccountId: null, ownerId: null });
});