import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";

const STORE_PATH = "settings.json";
let _store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await Store.load(STORE_PATH);
  }
  return _store;
}

export async function getYouTubeApiKey(): Promise<string> {
  return (
    (await invoke<string | null>("get_credential", {
      key: "youtube_api_key",
    })) ?? ""
  );
}

export async function setYouTubeApiKey(key: string): Promise<void> {
  await invoke("set_credential", { key: "youtube_api_key", value: key });
}

// ── Read-aloud (TTS) ──────────────────────────────────────────────────────────

/** Google Cloud TTS API key — stored in the OS keychain, not the plaintext store. */
export async function getGoogleTtsApiKey(): Promise<string> {
  return (
    (await invoke<string | null>("get_credential", {
      key: "gcp_tts_api_key",
    })) ?? ""
  );
}

export async function setGoogleTtsApiKey(key: string): Promise<void> {
  await invoke("set_credential", { key: "gcp_tts_api_key", value: key });
}

/** Which voice engine read-aloud uses. "system" = free built-in Web Speech. */
export type TtsEngine = "system" | "google" | "elevenlabs";

export async function getTtsEngine(): Promise<TtsEngine> {
  const store = await getStore();
  const v = await store.get<string>("tts_engine");
  return v === "google" || v === "elevenlabs" ? v : "system";
}

export async function setTtsEngine(engine: TtsEngine): Promise<void> {
  const store = await getStore();
  await store.set("tts_engine", engine);
  await store.save();
}

export type GoogleTtsVoice = { name: string; lang: string };

export async function getGoogleTtsVoice(): Promise<GoogleTtsVoice | null> {
  const store = await getStore();
  const name = await store.get<string>("tts_voice");
  const lang = await store.get<string>("tts_voice_lang");
  return name && lang ? { name, lang } : null;
}

export async function setGoogleTtsVoice(voice: GoogleTtsVoice): Promise<void> {
  const store = await getStore();
  await store.set("tts_voice", voice.name);
  await store.set("tts_voice_lang", voice.lang);
  await store.save();
}

// ── ElevenLabs ────────────────────────────────────────────────────────────────

/** ElevenLabs API key — stored in the OS keychain, not the plaintext store. */
export async function getElevenLabsApiKey(): Promise<string> {
  return (
    (await invoke<string | null>("get_credential", {
      key: "elevenlabs_api_key",
    })) ?? ""
  );
}

export async function setElevenLabsApiKey(key: string): Promise<void> {
  await invoke("set_credential", { key: "elevenlabs_api_key", value: key });
}

export type ElevenLabsVoice = { id: string; name: string };

export async function getElevenLabsVoice(): Promise<ElevenLabsVoice | null> {
  const store = await getStore();
  const id = await store.get<string>("elevenlabs_voice_id");
  const name = await store.get<string>("elevenlabs_voice_name");
  return id ? { id, name: name ?? id } : null;
}

export async function setElevenLabsVoice(
  voice: ElevenLabsVoice,
): Promise<void> {
  const store = await getStore();
  await store.set("elevenlabs_voice_id", voice.id);
  await store.set("elevenlabs_voice_name", voice.name);
  await store.save();
}

export const ELEVENLABS_DEFAULT_MODEL = "eleven_turbo_v2_5";

export async function getElevenLabsModel(): Promise<string> {
  const store = await getStore();
  return (
    (await store.get<string>("elevenlabs_model")) ?? ELEVENLABS_DEFAULT_MODEL
  );
}

export async function setElevenLabsModel(model: string): Promise<void> {
  const store = await getStore();
  await store.set("elevenlabs_model", model);
  await store.save();
}

/**
 * Background auto-refresh interval, in seconds. `0` means manual only
 * (auto-refresh disabled). Defaults to 900 (15 min). Read by the Rust crawler.
 */
export async function getRefreshIntervalSecs(): Promise<number> {
  const store = await getStore();
  const v = await store.get<number>("refresh_interval_secs");
  return typeof v === "number" && v >= 0 ? v : 900;
}

export async function setRefreshIntervalSecs(secs: number): Promise<void> {
  const store = await getStore();
  await store.set("refresh_interval_secs", secs);
  await store.save();
}

/**
 * Whether the app checks GitHub for a new version on launch (at most once a
 * day). On by default; the only request the app makes on its own besides
 * fetching feeds. See src/lib/updater.ts.
 */
export async function getAutoUpdateCheck(): Promise<boolean> {
  const store = await getStore();
  const v = await store.get<boolean>("auto_update_check");
  return typeof v === "boolean" ? v : true;
}

export async function setAutoUpdateCheck(enabled: boolean): Promise<void> {
  const store = await getStore();
  await store.set("auto_update_check", enabled);
  await store.save();
}

/** When the last automatic update check ran, in ms since the epoch; 0 if never. */
export async function getLastUpdateCheck(): Promise<number> {
  const store = await getStore();
  const v = await store.get<number>("update_last_checked");
  return typeof v === "number" && v > 0 ? v : 0;
}

export async function setLastUpdateCheck(ms: number): Promise<void> {
  const store = await getStore();
  await store.set("update_last_checked", ms);
  await store.save();
}

export async function getObsidianVaultPath(): Promise<string> {
  const store = await getStore();
  return (await store.get<string>("obsidian_vault_path")) ?? "";
}

export async function setObsidianVaultPath(path: string): Promise<void> {
  const store = await getStore();
  await store.set("obsidian_vault_path", path);
  await store.save();
}

// ── AI ────────────────────────────────────────────────────────────────────────

/**
 * Which backend answers AI requests. Mirrors `AiProvider` in Rust. It was
 * "ollama" while the Local provider could only mean Ollama; "local" is the
 * name that covers both protocols.
 */
export type AiProvider = "local" | "gemini";

/**
 * Which wire protocol the Local provider speaks. Mirrors `LocalProtocol` in
 * Rust. "ollama" is the default so configs written before this existed are
 * read unchanged; "openai" covers llama.cpp's server, vLLM, LM Studio,
 * OpenRouter and Ollama's own `/v1` shim.
 */
export type LocalProtocol = "ollama" | "openai";

/**
 * Both providers are configured independently and persist side by side, so
 * switching back and forth doesn't lose the other one's setup.
 */
export type AiSettings = {
  enabled: boolean;
  provider: AiProvider;
  localProtocol: LocalProtocol;
  localApiUrl: string;
  localModel: string;
  geminiModel: string;
};

export const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";

const AI_DEFAULTS: AiSettings = {
  enabled: false,
  provider: "local",
  localProtocol: "ollama",
  localApiUrl: "http://localhost:11434",
  localModel: "llama3.2",
  geminiModel: GEMINI_DEFAULT_MODEL,
};

/**
 * The subset of settings an AI command needs — what the Rust `AiConfig`
 * deserializes. Gemini's key is read from the keychain in Rust, so it is
 * deliberately absent here.
 */
export type AiConfig = {
  provider: AiProvider;
  model: string;
  baseUrl?: string;
  protocol: LocalProtocol;
};

/**
 * One model the Local provider offers, mirroring `LocalModel` in Rust. Only
 * `name` is guaranteed: Ollama reports size and quantisation, an
 * OpenAI-compatible server usually reports nothing but the id.
 */
export type LocalModel = {
  name: string;
  sizeMb?: number;
  parameterSize?: string;
  quantization?: string;
  modifiedAt?: string;
  contextLength?: number;
};

export function aiConfig(settings: AiSettings): AiConfig {
  return settings.provider === "gemini"
    ? {
        provider: "gemini",
        model: settings.geminiModel,
        protocol: settings.localProtocol,
      }
    : {
        provider: "local",
        model: settings.localModel,
        baseUrl: settings.localApiUrl,
        protocol: settings.localProtocol,
      };
}

/**
 * Store keys renamed as the Local provider outgrew Ollama, each with the name
 * it had before. A read falls back to the old name, a save writes the new one
 * and drops the old, so an existing install keeps its configuration on upgrade.
 */
const AI_ENABLED_KEY = "ai_enabled";
const AI_ENABLED_KEY_LEGACY = "ollama_enabled";
const LOCAL_MODEL_KEY = "local_model";
const LOCAL_MODEL_KEY_LEGACY = "ollama_model";
const LOCAL_API_URL_KEY = "local_api_url";
const LOCAL_API_URL_KEY_LEGACY = "ollama_url";

export async function getAiSettings(): Promise<AiSettings> {
  const store = await getStore();
  // "ollama" was the only non-Gemini value before the provider was renamed, so
  // reading it as Local covers old files without a migration of its own.
  const provider = await store.get<string>("ai_provider");
  return {
    enabled:
      (await store.get<boolean>(AI_ENABLED_KEY)) ??
      (await store.get<boolean>(AI_ENABLED_KEY_LEGACY)) ??
      AI_DEFAULTS.enabled,
    provider: provider === "gemini" ? "gemini" : AI_DEFAULTS.provider,
    localProtocol:
      (await store.get<string>("ai_local_protocol")) === "openai"
        ? "openai"
        : AI_DEFAULTS.localProtocol,
    localApiUrl:
      (await store.get<string>(LOCAL_API_URL_KEY)) ??
      (await store.get<string>(LOCAL_API_URL_KEY_LEGACY)) ??
      AI_DEFAULTS.localApiUrl,
    localModel:
      (await store.get<string>(LOCAL_MODEL_KEY)) ??
      (await store.get<string>(LOCAL_MODEL_KEY_LEGACY)) ??
      AI_DEFAULTS.localModel,
    geminiModel:
      (await store.get<string>("gemini_model")) ?? AI_DEFAULTS.geminiModel,
  };
}

export async function setAiSettings(settings: AiSettings): Promise<void> {
  const store = await getStore();
  await store.set(AI_ENABLED_KEY, settings.enabled);
  await store.delete(AI_ENABLED_KEY_LEGACY);
  await store.set("ai_provider", settings.provider);
  await store.set("ai_local_protocol", settings.localProtocol);
  await store.set(LOCAL_API_URL_KEY, settings.localApiUrl);
  await store.delete(LOCAL_API_URL_KEY_LEGACY);
  await store.set(LOCAL_MODEL_KEY, settings.localModel);
  await store.delete(LOCAL_MODEL_KEY_LEGACY);
  await store.set("gemini_model", settings.geminiModel);
  await store.save();
}

/** Gemini API key — stored in the OS keychain, not the plaintext store. */
export async function getGeminiApiKey(): Promise<string> {
  return (
    (await invoke<string | null>("get_credential", {
      key: "gemini_api_key",
    })) ?? ""
  );
}

export async function setGeminiApiKey(key: string): Promise<void> {
  await invoke("set_credential", { key: "gemini_api_key", value: key });
}

/**
 * Bearer token for the OpenAI-compatible protocol — keychain, and never sent
 * over IPC with a request. The Ollama protocol has no key: its transport never
 * reads this, and Settings shows no field for it, so a token stored here simply
 * waits unused until the OpenAI protocol is selected again.
 *
 * Reads the current name first and falls back to the name used while Local
 * could only mean Ollama, moving the key forward so an existing install does
 * not silently lose it. The Rust side does the same migration on its own read.
 */
const LOCAL_AI_KEY = "local_ai_api_key";
const LOCAL_AI_KEY_LEGACY = "ollama_api_key";

export async function getLocalAiApiKey(): Promise<string> {
  const current = await invoke<string | null>("get_credential", {
    key: LOCAL_AI_KEY,
  });
  if (current?.trim()) return current;
  const legacy = await invoke<string | null>("get_credential", {
    key: LOCAL_AI_KEY_LEGACY,
  });
  if (legacy?.trim()) {
    await setLocalAiApiKey(legacy);
    await invoke("set_credential", { key: LOCAL_AI_KEY_LEGACY, value: "" });
    return legacy;
  }
  return "";
}

export async function setLocalAiApiKey(key: string): Promise<void> {
  await invoke("set_credential", { key: LOCAL_AI_KEY, value: key });
}

// ── Reset ───────────────────────────────────────────────────────────────────

/**
 * Resets all app settings to their defaults: clears the settings store (
 * TTS, AI, Obsidian path) and removes stored API keys from the OS keychain.
 * Does not touch feeds/articles — see `eraseAllData` in lib/db for those.
 */
export async function resetSettings(): Promise<void> {
  const store = await getStore();
  await store.clear();
  await store.save();
  await setYouTubeApiKey("");
  await setGoogleTtsApiKey("");
  await setGeminiApiKey("");
  await setLocalAiApiKey("");
  await invoke("set_credential", { key: LOCAL_AI_KEY_LEGACY, value: "" });
}
