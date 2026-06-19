import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link } from "@tanstack/react-router";
import {
  getYouTubeApiKey, setYouTubeApiKey,
  getOllamaSettings, setOllamaSettings,
  getAppTheme, setAppTheme,
  getObsidianVaultPath, setObsidianVaultPath,
  getGoogleTtsApiKey, setGoogleTtsApiKey,
  getTtsEngine, setTtsEngine,
  getGoogleTtsVoice, setGoogleTtsVoice,
  type OllamaSettings, type AppTheme, type TtsEngine,
} from "../lib/settings";
import { applyTheme } from "../lib/theme";

type SaveState = "idle" | "saving" | "saved" | "error";

function SettingField({
  label, description, value, onChange, onSave, placeholder, type = "text", saveState,
}: {
  label: string; description: string; value: string; onChange: (v: string) => void;
  onSave: () => void; placeholder: string; type?: string; saveState: SaveState;
}) {
  return (
    <div className="border border-outline-variant/40 p-5 space-y-3">
      <div>
        <p className="text-sm font-headline font-semibold text-on-surface">{label}</p>
        <p className="text-xs font-body text-on-surface-variant mt-0.5">{description}</p>
      </div>
      <div className="flex gap-2">
        {type === "textarea" ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4}
            className="flex-1 ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary resize-y" />
        ) : (
          <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            className="flex-1 ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary" />
        )}
        <button onClick={onSave} disabled={saveState === "saving"}
          className="shrink-0 bg-primary-container px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-on-primary-container transition-opacity hover:opacity-90 disabled:opacity-40">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Error" : "Save"}
        </button>
      </div>
    </div>
  );
}

const THEME_OPTIONS: { value: AppTheme; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Warm cream" },
  { value: "dark", label: "Dark", description: "Warm dark" },
  { value: "system", label: "System", description: "Follow macOS" },
];

function AppearanceSection() {
  const [theme, setTheme] = useState<AppTheme>("system");

  useEffect(() => {
    getAppTheme().then(setTheme).catch(console.error);
  }, []);

  function update(next: AppTheme) {
    setTheme(next);
    applyTheme(next);
    setAppTheme(next).catch(console.error);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-label font-bold uppercase tracking-widest text-outline">Appearance</h2>
      <div className="border border-outline-variant/40 p-5 space-y-3">
        <div>
          <p className="text-sm font-headline font-semibold text-on-surface">Theme</p>
          <p className="text-xs font-body text-on-surface-variant mt-0.5">
            Applies to the whole app. The article reader keeps its own theme setting.
          </p>
        </div>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => update(opt.value)} aria-pressed={theme === opt.value}
              className={["flex-1 px-3 py-2 text-[11px] font-label font-bold uppercase tracking-widest transition-colors",
                theme === opt.value
                  ? "bg-primary-container text-on-primary-container"
                  : "ghost-border bg-surface-container-low text-on-surface-variant hover:text-on-surface",
              ].join(" ")}>
              {opt.label}
              <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal opacity-70">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

type OllamaCheckState = "idle" | "checking" | "ok" | "error";

function OllamaSection() {
  const [settings, setSettings] = useState<OllamaSettings>({ enabled: false, url: "http://localhost:11434", model: "llama3.2" });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [checkState, setCheckState] = useState<OllamaCheckState>("idle");
  const [checkMessage, setCheckMessage] = useState("");

  useEffect(() => {
    getOllamaSettings().then(setSettings).catch(console.error);
  }, []);

  async function save(updated: OllamaSettings) {
    setSaveState("saving");
    try {
      await setOllamaSettings(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }

  async function checkConnection() {
    setCheckState("checking");
    setCheckMessage("");
    try {
      const models = await invoke<string[]>("check_ollama", { baseUrl: settings.url });
      const match = models.find((m) => m.startsWith(settings.model));
      if (match) {
        setCheckMessage(`Model "${match}" found`);
        setCheckState("ok");
      } else if (models.length > 0) {
        setCheckMessage(`Ollama reachable. Model "${settings.model}" not found. Available: ${models.slice(0, 3).join(", ")}`);
        setCheckState("error");
      } else {
        setCheckMessage("Ollama reachable but no models installed. Run: ollama pull " + settings.model);
        setCheckState("error");
      }
    } catch (err) {
      setCheckMessage(String(err));
      setCheckState("error");
    }
  }

  function update(patch: Partial<OllamaSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setCheckState("idle");
    setCheckMessage("");
    save(next);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-label font-bold uppercase tracking-widest text-outline">AI Summarization</h2>

      {/* Enable toggle */}
      <div className="border border-outline-variant/40 p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-headline font-semibold text-on-surface">Enable Ollama Summarization</p>
          <p className="text-xs font-body text-on-surface-variant mt-0.5">
            Adds a Summarize button in the article reader. Requires a locally running Ollama instance.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={settings.enabled}
          onClick={() => update({ enabled: !settings.enabled })}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${settings.enabled ? "bg-primary" : "bg-outline/30"}`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${settings.enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {/* URL and model config */}
      <div className="border border-outline-variant/40 p-5 space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-headline font-semibold text-on-surface">Ollama Base URL</p>
          <div className="flex gap-2">
            <input
              value={settings.url}
              onChange={(e) => setSettings((s) => ({ ...s, url: e.target.value }))}
              onBlur={() => save(settings)}
              placeholder="http://localhost:11434"
              className="flex-1 ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-headline font-semibold text-on-surface">Model</p>
          <div className="flex gap-2">
            <input
              value={settings.model}
              onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
              onBlur={() => save(settings)}
              placeholder="llama3.2"
              className="flex-1 ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={checkConnection}
              disabled={checkState === "checking"}
              className="shrink-0 bg-primary-container px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-on-primary-container transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {checkState === "checking" ? "Checking…" : "Test"}
            </button>
          </div>
        </div>

        {checkMessage && (
          <p className={`text-[11px] font-body ${checkState === "ok" ? "text-primary" : "text-error"}`}>
            {checkState === "ok" ? "✓ " : "✗ "}{checkMessage}
          </p>
        )}

        <p className="text-[10px] font-body text-on-surface-variant">
          To install a model: <code className="bg-surface-container px-1 py-0.5 rounded text-[10px]">ollama pull {settings.model || "llama3.2"}</code>
        </p>

        {saveState === "saved" && (
          <p className="text-[11px] font-label text-primary">Settings saved ✓</p>
        )}
      </div>
    </section>
  );
}

type GoogleVoice = {
  name: string;
  languageCodes: string[];
  ssmlGender: string;
  naturalSampleRateHertz?: number;
};

const TTS_ENGINES: { value: TtsEngine; label: string; description: string }[] = [
  { value: "system", label: "System", description: "Free, offline" },
  { value: "google", label: "Google", description: "Your API key" },
];

function uniqueLangs(list: GoogleVoice[]): string[] {
  return Array.from(new Set(list.flatMap((v) => v.languageCodes))).sort();
}

function TtsSection() {
  const [engine, setEngine] = useState<TtsEngine>("system");
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [keySave, setKeySave] = useState<SaveState>("idle");

  const [voices, setVoices] = useState<GoogleVoice[] | null>(null);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [lang, setLang] = useState("en-US");
  const [voiceName, setVoiceName] = useState("");

  useEffect(() => {
    getTtsEngine().then(setEngine).catch(console.error);
    getGoogleTtsApiKey().then((k) => setHasKey(!!k.trim())).catch(console.error);
    getGoogleTtsVoice()
      .then((v) => { if (v) { setLang(v.lang); setVoiceName(v.name); } })
      .catch(console.error);
  }, []);

  function chooseEngine(next: TtsEngine) {
    setEngine(next);
    setTtsEngine(next).catch(console.error);
  }

  async function loadVoices() {
    setLoadingVoices(true);
    setVoiceError(null);
    try {
      const list = await invoke<GoogleVoice[]>("list_tts_voices");
      list.sort((a, b) => a.name.localeCompare(b.name));
      setVoices(list);
      const langs = uniqueLangs(list);
      if (!langs.includes(lang)) setLang(langs.includes("en-US") ? "en-US" : langs[0] ?? "en-US");
    } catch (e) {
      setVoiceError(String(e));
    } finally {
      setLoadingVoices(false);
    }
  }

  async function saveKey() {
    const trimmed = key.trim();
    if (!trimmed) return;
    setKeySave("saving");
    try {
      await setGoogleTtsApiKey(trimmed);
      setHasKey(true);
      setKey("");
      setKeySave("saved");
      setTimeout(() => setKeySave("idle"), 2000);
      loadVoices();
    } catch {
      setKeySave("error");
    }
  }

  function chooseVoice(name: string, voiceLang: string) {
    setVoiceName(name);
    setGoogleTtsVoice({ name, lang: voiceLang }).catch(console.error);
  }

  function chooseLang(next: string) {
    setLang(next);
    const first = (voices ?? []).find((v) => v.languageCodes.includes(next));
    if (first) chooseVoice(first.name, next);
  }

  const langs = voices ? uniqueLangs(voices) : [];
  const voicesForLang = voices ? voices.filter((v) => v.languageCodes.includes(lang)) : [];

  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-label font-bold uppercase tracking-widest text-outline">Read Aloud</h2>
      <div className="border border-outline-variant/40 p-5 space-y-4">
        <div>
          <p className="text-sm font-headline font-semibold text-on-surface">Voice</p>
          <p className="text-xs font-body text-on-surface-variant mt-0.5">
            System voices are free and work offline. Google Cloud voices are higher quality and billed
            to your own Google account via an API key.
          </p>
        </div>

        <div className="flex gap-2">
          {TTS_ENGINES.map((opt) => (
            <button key={opt.value} onClick={() => chooseEngine(opt.value)} aria-pressed={engine === opt.value}
              className={["flex-1 px-3 py-2 text-[11px] font-label font-bold uppercase tracking-widest transition-colors",
                engine === opt.value
                  ? "bg-primary-container text-on-primary-container"
                  : "ghost-border bg-surface-container-low text-on-surface-variant hover:text-on-surface",
              ].join(" ")}>
              {opt.label}
              <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal opacity-70">{opt.description}</span>
            </button>
          ))}
        </div>

        {engine === "system" ? (
          <p className="text-xs font-body text-on-surface-variant">
            Uses your Mac's built-in speech voices. Pick or download higher-quality system voices in
            macOS System Settings → Accessibility → Spoken Content → System Voice.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-headline font-semibold text-on-surface">Google Cloud TTS API Key</p>
              <p className="text-xs font-body text-on-surface-variant">
                In Google Cloud: enable the Text-to-Speech API, create an API key (restrict it to that
                API), then paste it here. Set a quota on the key to cap spend.
              </p>
              <div className="flex gap-2">
                <input type="password" value={key} onChange={(e) => setKey(e.target.value)}
                  placeholder={hasKey ? "••••••••  saved — enter a new key to replace" : "AIzaSy..."}
                  className="flex-1 ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary" />
                <button onClick={saveKey} disabled={keySave === "saving"}
                  className="shrink-0 bg-primary-container px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-on-primary-container transition-opacity hover:opacity-90 disabled:opacity-40">
                  {keySave === "saving" ? "Saving…" : keySave === "saved" ? "Saved ✓" : keySave === "error" ? "Error" : "Save"}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-headline font-semibold text-on-surface">Voice</p>
                <button onClick={loadVoices} disabled={loadingVoices || (!hasKey && !key.trim())}
                  className="shrink-0 ghost-border px-3 py-1.5 text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant transition-opacity hover:opacity-90 disabled:opacity-40">
                  {loadingVoices ? "Loading…" : voices ? "Reload" : "Load voices"}
                </button>
              </div>

              {!voices && !voiceError && (
                <p className="text-xs font-body text-on-surface-variant">
                  {key.trim() ? "Load voices to choose one." : "Save your API key to load voices."}
                </p>
              )}

              {voices && (
                <div className="flex gap-2">
                  <select value={lang} onChange={(e) => chooseLang(e.target.value)}
                    className="ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">
                    {langs.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <select value={voiceName} onChange={(e) => chooseVoice(e.target.value, lang)}
                    className="flex-1 ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">
                    {voicesForLang.map((v) => (
                      <option key={v.name} value={v.name}>{v.name} · {v.ssmlGender.toLowerCase()}</option>
                    ))}
                  </select>
                </div>
              )}

              {voiceError && <p className="text-[11px] font-body text-error">✗ {voiceError}</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const [ytKey, setYtKey] = useState("");
  const [ytHasKey, setYtHasKey] = useState(false);
  const [ytSave, setYtSave] = useState<SaveState>("idle");
  const [vaultPath, setVaultPath] = useState("");
  const [vaultSave, setVaultSave] = useState<SaveState>("idle");

  useEffect(() => {
    getYouTubeApiKey().then((k) => setYtHasKey(!!k.trim())).catch(console.error);
    getObsidianVaultPath().then(setVaultPath).catch(console.error);
  }, []);

  async function saveVaultPath() {
    setVaultSave("saving");
    try { await setObsidianVaultPath(vaultPath.trim()); setVaultSave("saved"); setTimeout(() => setVaultSave("idle"), 2000); }
    catch { setVaultSave("error"); }
  }

  async function saveYtKey() {
    const trimmed = ytKey.trim();
    if (!trimmed) return;
    setYtSave("saving");
    try { await setYouTubeApiKey(trimmed); setYtHasKey(true); setYtKey(""); setYtSave("saved"); setTimeout(() => setYtSave("idle"), 2000); }
    catch { setYtSave("error"); }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-outline-variant/40 bg-background/80 backdrop-blur-xl px-6">
        <Link to="/" aria-label="Back to reader"
          className="rounded p-1.5 text-on-surface-variant transition-colors hover:text-primary">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="font-headline text-lg font-bold tracking-[0.2em] text-primary uppercase">Settings</span>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-2xl space-y-8">

          <AppearanceSection />

          <section className="space-y-3">
            <h2 className="text-[10px] font-label font-bold uppercase tracking-widest text-outline">YouTube</h2>
            <SettingField
              label="YouTube Data API Key"
              description="Required to subscribe to YouTube @handle channels. Get a key from Google Cloud Console."
              value={ytKey} onChange={setYtKey} onSave={saveYtKey} type="password"
              placeholder={ytHasKey ? "••••••••  saved — enter a new key to replace" : "AIzaSy..."} saveState={ytSave} />
          </section>

          <TtsSection />

          <OllamaSection />

          <section className="space-y-3">
            <h2 className="text-[10px] font-label font-bold uppercase tracking-widest text-outline">Export</h2>
            <SettingField
              label="Obsidian Vault Folder"
              description='Absolute path to a folder inside your vault. "Send to Obsidian" writes one markdown file per article with your highlights and notes.'
              value={vaultPath} onChange={setVaultPath} onSave={saveVaultPath}
              placeholder="/Users/you/Documents/Vault/Feedlight" saveState={vaultSave} />
          </section>

        </div>
      </div>
    </div>
  );
}
