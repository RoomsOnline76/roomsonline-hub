import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCreateApiKeyXml } from "./ruApiKeyXml.ts";

Deno.test("Push_CreateApiKey_RQ follows the ordered password-auth schema", () => {
  const xml = buildCreateApiKeyXml({
    mode: "password",
    username: "child&owner@example.com",
    password: 'Pass<word>12"&',
  }, "ROLOS & partner");

  assertStringIncludes(
    xml,
    "<Authentication><UserName>child&amp;owner@example.com</UserName><Password>Pass&lt;word&gt;12&quot;&amp;</Password></Authentication><Label>ROLOS &amp; partner</Label><Scope>XmlApi</Scope>",
  );
  assertEquals(xml.includes("<OwnerID>"), false);
  assertEquals(xml.indexOf("<Authentication>"), xml.indexOf("<Push_CreateApiKey_RQ>") + "<Push_CreateApiKey_RQ>".length);
  assertEquals(xml.indexOf("<Label>" ) < xml.indexOf("<Scope>"), true);
  assertEquals(xml.indexOf("<AccessKey>"), -1);
});

Deno.test("Push_CreateApiKey_RQ uses only supplied child keys for key-auth minting", () => {
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
});