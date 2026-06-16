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
  return (await invoke<string | null>("get_credential", { key: "youtube_api_key" })) ?? "";
}

export async function setYouTubeApiKey(key: string): Promise<void> {
  await invoke("set_credential", { key: "youtube_api_key", value: key });
}

export type AppTheme = "light" | "dark" | "system";

export async function getAppTheme(): Promise<AppTheme> {
  const store = await getStore();
  const v = await store.get<string>("app_theme");
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export async function setAppTheme(theme: AppTheme): Promise<void> {
  const store = await getStore();
  await store.set("app_theme", theme);
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

export type OllamaSettings = {
  enabled: boolean;
  url: string;
  model: string;
};

const OLLAMA_DEFAULTS: OllamaSettings = {
  enabled: false,
  url: "http://localhost:11434",
  model: "llama3.2",
};

export async function getOllamaSettings(): Promise<OllamaSettings> {
  const store = await getStore();
  const enabled = (await store.get<boolean>("ollama_enabled")) ?? OLLAMA_DEFAULTS.enabled;
  const url = (await store.get<string>("ollama_url")) ?? OLLAMA_DEFAULTS.url;
  const model = (await store.get<string>("ollama_model")) ?? OLLAMA_DEFAULTS.model;
  return { enabled, url, model };
}

export async function setOllamaSettings(settings: OllamaSettings): Promise<void> {
  const store = await getStore();
  await store.set("ollama_enabled", settings.enabled);
  await store.set("ollama_url", settings.url);
  await store.set("ollama_model", settings.model);
  await store.save();
}
