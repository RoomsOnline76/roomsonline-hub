import { assertEquals, assertStringIncludes, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCreateApiKeyXml, type RuApiKeyAuth } from "./ruApiKeyXml.ts";


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

Deno.test("Push_CreateApiKey_RQ refuses portal credentials at runtime", () => {
  const passwordAuth = {
    mode: "password",
    username: "sub-user@example.com",
    password: "secret",
  } as unknown as RuApiKeyAuth;

  assertThrows(
    () => buildCreateApiKeyXml(passwordAuth, "ROLOS"),
    Error,
    "RU_FIRST_API_KEY_REQUIRED",
  );
});
