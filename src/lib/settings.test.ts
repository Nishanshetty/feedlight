import { beforeEach, describe, expect, it, vi } from "vitest";

// settings.ts talks to Tauri in three places: the keychain commands, the
// settings store, and nothing else. Both are replaced here so the tests can
// watch what is read and written instead of hitting a real keychain.
const keychain = new Map<string, string>();

const invoke = vi.fn(async (cmd: string, args: { key: string; value?: string }) => {
  if (cmd === "get_credential") return keychain.get(args.key) ?? null;
  if (cmd === "set_credential") {
    if (!args.value) keychain.delete(args.key);
    else keychain.set(args.key, args.value);
    return undefined;
  }
  throw new Error(`unexpected command: ${cmd}`);
});

const storeMap = new Map<string, unknown>();
const store = {
  get: vi.fn(async (key: string) => storeMap.get(key) ?? null),
  set: vi.fn(async (key: string, value: unknown) => void storeMap.set(key, value)),
  save: vi.fn(async () => undefined),
  clear: vi.fn(async () => storeMap.clear()),
};

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-store", () => ({
  Store: { load: async () => store },
}));

const settings = await import("./settings");

beforeEach(() => {
  keychain.clear();
  storeMap.clear();
  invoke.mockClear();
  store.get.mockClear();
  store.set.mockClear();
});

function credentialWrites() {
  return invoke.mock.calls
    .filter(([cmd]) => cmd === "set_credential")
    .map(([, args]) => args);
}

describe("aiConfig", () => {
  const base = {
    enabled: true,
    provider: "ollama" as const,
    localProtocol: "ollama" as const,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "llama3.2",
    geminiModel: "gemini-3.6-flash",
  };

  it("sends the protocol to the local provider so it picks a transport", () => {
    expect(settings.aiConfig({ ...base, localProtocol: "openai" })).toEqual({
      provider: "ollama",
      model: "llama3.2",
      baseUrl: "http://localhost:11434",
      protocol: "openai",
    });
  });

  it("sends the protocol for Gemini too, because Rust deserializes one shape", () => {
    const config = settings.aiConfig({ ...base, provider: "gemini" });
    expect(config.provider).toBe("gemini");
    expect(config.baseUrl).toBeUndefined();
    expect(config.protocol).toBe("ollama");
  });
});

describe("getLocalAiApiKey", () => {
  it("moves a key saved under the old name to the current one", async () => {
    keychain.set("ollama_api_key", "legacy-token");

    await expect(settings.getLocalAiApiKey()).resolves.toBe("legacy-token");

    expect(keychain.get("local_ai_api_key")).toBe("legacy-token");
    expect(keychain.has("ollama_api_key")).toBe(false);
  });

  it("leaves a current-name key alone instead of re-reading the legacy one", async () => {
    keychain.set("local_ai_api_key", "current-token");

    await expect(settings.getLocalAiApiKey()).resolves.toBe("current-token");

    expect(credentialWrites()).toEqual([]);
  });

  it("reports no key when neither name exists", async () => {
    await expect(settings.getLocalAiApiKey()).resolves.toBe("");
    expect(credentialWrites()).toEqual([]);
  });

  it("treats a blank legacy entry as no key, not as something to migrate", async () => {
    keychain.set("ollama_api_key", "   ");

    await expect(settings.getLocalAiApiKey()).resolves.toBe("");
    expect(credentialWrites()).toEqual([]);
  });
});

describe("setAiSettings", () => {
  it("persists the protocol so a restart keeps the OpenAI transport", async () => {
    await settings.setAiSettings({
      enabled: true,
      provider: "ollama",
      localProtocol: "openai",
      ollamaUrl: "http://192.168.0.109:8080/v1",
      ollamaModel: "qwen3.8-flash",
      geminiModel: "gemini-3.6-flash",
    });

    await expect(settings.getAiSettings()).resolves.toMatchObject({
      localProtocol: "openai",
      ollamaUrl: "http://192.168.0.109:8080/v1",
      ollamaModel: "qwen3.8-flash",
    });
  });

  it("defaults the protocol to ollama for a settings file written before it existed", async () => {
    storeMap.set("ollama_url", "http://localhost:11434");

    await expect(settings.getAiSettings()).resolves.toMatchObject({
      provider: "ollama",
      localProtocol: "ollama",
    });
  });
});

describe("resetSettings", () => {
  it("clears the local key under both names", async () => {
    keychain.set("local_ai_api_key", "current-token");
    keychain.set("ollama_api_key", "legacy-token");

    await settings.resetSettings();

    expect(keychain.size).toBe(0);
  });
});
