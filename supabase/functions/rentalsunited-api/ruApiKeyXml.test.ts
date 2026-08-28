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

Deno.test("Push_CreateApiKey_RQ supports the verified white-label OwnerID mint", () => {
  const xml = buildCreateApiKeyXml({
    mode: "owner_scoped",
    access_key: "master-access",
    secret_key: "master-secret",
    owner_id: "742612",
  }, "ROLOS-m");

  assertStringIncludes(
    xml,
    "<Authentication><AccessKey>master-access</AccessKey><SecretKey>master-secret</SecretKey></Authentication><OwnerID>742612</OwnerID><Label>ROLOS-m</Label><Scope>XmlApi</Scope>",
  );
  assertEquals(xml.includes("<UserName>"), false);
});