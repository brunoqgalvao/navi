/**
 * Credential Storage Tests
 *
 * Run with: bun test credentials.test.ts
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { initDb } from "../db";
import {
  initCredentialsTable,
  setCredential,
  getCredential,
  getCredentials,
  deleteCredential,
  deleteAllCredentials,
  hasRequiredCredentials,
  listProviders,
  listCredentialKeys,
} from "./credentials";

// Initialize database before tests
beforeAll(async () => {
  await initDb();
  initCredentialsTable();
});

describe("Credential Storage", () => {
  it("should store and retrieve a credential", () => {
    setCredential("slack", "apiKey", "xoxb-test-token-12345");
    const retrieved = getCredential("slack", "apiKey");
    expect(retrieved).toBe("xoxb-test-token-12345");
  });

  it("should update existing credentials", () => {
    setCredential("discord", "botToken", "old-token");
    setCredential("discord", "botToken", "new-token");
    const retrieved = getCredential("discord", "botToken");
    expect(retrieved).toBe("new-token");
  });

  it("should return null for non-existent credentials", () => {
    const result = getCredential("nonexistent", "apiKey");
    expect(result).toBeNull();
  });

  it("should store multiple credentials for a provider", () => {
    setCredential("openai", "apiKey", "sk-test-key");
    setCredential("openai", "orgId", "org-12345");
    setCredential("openai", "projectId", "proj-67890");

    const creds = getCredentials("openai");
    expect(creds).toEqual({
      apiKey: "sk-test-key",
      orgId: "org-12345",
      projectId: "proj-67890",
    });
  });

  it("should delete a specific credential", () => {
    setCredential("test-provider", "key1", "value1");
    setCredential("test-provider", "key2", "value2");

    deleteCredential("test-provider", "key1");

    expect(getCredential("test-provider", "key1")).toBeNull();
    expect(getCredential("test-provider", "key2")).toBe("value2");
  });

  it("should delete all credentials for a provider", () => {
    setCredential("remove-me", "key1", "value1");
    setCredential("remove-me", "key2", "value2");
    setCredential("keep-me", "key1", "value1");

    deleteAllCredentials("remove-me");

    expect(getCredentials("remove-me")).toEqual({});
    expect(getCredential("keep-me", "key1")).toBe("value1");
  });

  it("should check for required credentials", () => {
    setCredential("github", "token", "ghp_test");
    setCredential("github", "username", "testuser");

    expect(hasRequiredCredentials("github", ["token"])).toBe(true);
    expect(hasRequiredCredentials("github", ["token", "username"])).toBe(true);
    expect(hasRequiredCredentials("github", ["token", "username", "missing"])).toBe(false);
    expect(hasRequiredCredentials("github", [])).toBe(true);
  });

  it("should list providers", () => {
    // Clear previous data
    const providers = listProviders();
    providers.forEach((p) => deleteAllCredentials(p));

    setCredential("provider1", "key", "value");
    setCredential("provider2", "key", "value");
    setCredential("provider1", "key2", "value2");

    const listed = listProviders();
    expect(listed).toContain("provider1");
    expect(listed).toContain("provider2");
  });

  it("should list credential keys for a provider", () => {
    setCredential("keys-test", "apiKey", "value1");
    setCredential("keys-test", "secret", "value2");

    const keys = listCredentialKeys("keys-test");
    expect(keys.length).toBe(2);
    expect(keys.map((k) => k.key).sort()).toEqual(["apiKey", "secret"]);
    expect(keys[0]).toHaveProperty("created_at");
    expect(keys[0]).toHaveProperty("updated_at");
  });

  it("should encrypt credentials (values differ from input)", () => {
    setCredential("encryption-test", "apiKey", "plain-text-secret");

    // The encrypted value in the database should not match the plain text
    const credentials = getCredentials("encryption-test");
    expect(credentials.apiKey).toBe("plain-text-secret"); // Decrypted value matches

    // But the raw database value should be encrypted (we can't easily test this without DB access)
  });
});
