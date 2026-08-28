import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCreateApiKeyXml } from "../_shared/ruApiKeyXml.ts";

Deno.test("Push_CreateApiKey_RQ requires child keys and preserves schema order", () => {
  const xml = buildCreateApiKeyXml({
    mode: "keys",
    access_key: "child-access",
    secret_key: "child-secret",
  }, "ROLOS");

  assertStringIncludes(
    xml,
    "<Authentication><AccessKey>child-access</AccessKey><SecretKey>child-secret</SecretKey></Authentication><Label>ROLOS</Label><Scope>XmlApi</Scope>",
  );
  assertEquals(xml.includes("<UserName>"), false);
  assertEquals(xml.includes("<Password>"), false);
  assertEquals(xml.indexOf("<Label>") < xml.indexOf("<Scope>"), true);
});

Deno.test("Push_CreateApiKey_RQ mints with the child login sent in Push_CreateUser_RQ", () => {
  const xml = buildCreateApiKeyXml({
    mode: "password",
    username: "leopard@roomsonline.co.za",
    password: "Str0ng!Passw0rd",
  }, "ROLOS");

  assertStringIncludes(
    xml,
    "<Authentication><UserName>leopard@roomsonline.co.za</UserName><Password>Str0ng!Passw0rd</Password></Authentication><Label>ROLOS</Label><Scope>XmlApi</Scope>",
  );
  assertEquals(xml.includes("<OwnerID>"), false);
  assertEquals(xml.includes("<AccessKey>"), false);
});
