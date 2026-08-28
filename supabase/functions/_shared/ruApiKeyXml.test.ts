import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCreateApiKeyXml } from "./ruApiKeyXml.ts";


Deno.test("Push_CreateApiKey_RQ uses the existing child key pair and ordered schema", () => {
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
  assertEquals(xml.includes("<OwnerID>"), false);
  assertEquals(xml.indexOf("<Authentication>"), xml.indexOf("<Push_CreateApiKey_RQ>") + "<Push_CreateApiKey_RQ>".length);
  assertEquals(xml.indexOf("<Label>") < xml.indexOf("<Scope>"), true);
});

Deno.test("Push_CreateApiKey_RQ mints the first pair with child login credentials", () => {
  const xml = buildCreateApiKeyXml({
    mode: "password",
    username: "sub-user@example.com",
    password: "secret",
  }, "ROLOS");
  assertStringIncludes(xml, "<Authentication><UserName>sub-user@example.com</UserName><Password>secret</Password></Authentication><Label>ROLOS</Label><Scope>XmlApi</Scope>");
  assertEquals(xml.includes("<AccessKey>"), false);
});

Deno.test("Push_CreateApiKey_RQ white-label mint keeps Authentication → OwnerID → Label → Scope", () => {
  const xml = buildCreateApiKeyXml({
    mode: "owner_scoped",
    access_key: "master-access",
    secret_key: "master-secret",
    owner_id: "742555",
  }, "ROLOS");
  assertStringIncludes(
    xml,
    "<Authentication><AccessKey>master-access</AccessKey><SecretKey>master-secret</SecretKey></Authentication><OwnerID>742555</OwnerID><Label>ROLOS</Label><Scope>XmlApi</Scope>",
  );
  assertEquals(xml.includes("<UserName>"), false);
  assertEquals(xml.indexOf("<Authentication>") < xml.indexOf("<OwnerID>"), true);
  assertEquals(xml.indexOf("<OwnerID>") < xml.indexOf("<Label>"), true);
  assertEquals(xml.indexOf("<Label>") < xml.indexOf("<Scope>"), true);
});

