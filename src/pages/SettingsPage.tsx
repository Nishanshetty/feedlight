import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Link } from "@tanstack/react-router";
import {
  getYouTubeApiKey, setYouTubeApiKey,
  getOllamaSettings, setOllamaSettings,
  getAppTheme, setAppTheme,
  getRefreshIntervalSecs, setRefreshIntervalSecs,
  getObsidianVaultPath, setObsidianVaultPath,
  getGoogleTtsApiKey, setGoogleTtsApiKey,
  getTtsEngine, setTtsEngine,
  getGoogleTtsVoice, setGoogleTtsVoice,
  getElevenLabsApiKey, setElevenLabsApiKey,
  getElevenLabsVoice, setElevenLabsVoice,
  getElevenLabsModel, setElevenLabsModel, ELEVENLABS_DEFAULT_MODEL,
  resetSettings,
  type OllamaSettings, type AppTheme, type TtsEngine,
} from "../lib/settings";
import { eraseAllData } from "../lib/db";
import { exportFeedsToOpml } from "../lib/opml";
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

const SYNC_PRESETS: { label: string; secs: number }[] = [
  { label: "Manual only", secs: 0 },
  { label: "Every 15 minutes", secs: 900 },
  { label: "Every 30 minutes", secs: 1800 },
  { label: "Every hour", secs: 3600 },
  { label: "Every 3 hours", secs: 10800 },
  { label: "Every 6 hours", secs: 21600 },
];

function FeedSyncingSection() {
  const [secs, setSecs] = useState(900);
  const [isCustom, setIsCustom] = useState(false);
  const [customMins, setCustomMins] = useState("30");

  useEffect(() => {
    getRefreshIntervalSecs().then((s) => {
      setSecs(s);
      if (!SYNC_PRESETS.some((p) => p.secs === s)) {
        setIsCustom(true);
        setCustomMins(String(Math.max(1, Math.round(s / 60))));
      }
    }).catch(console.error);
  }, []);

  function save(next: number) {
    setSecs(next);
    setRefreshIntervalSecs(next).catch(console.error);
  }

  function onSelect(value: string) {
    if (value === "custom") {
      const mins = secs > 0 ? Math.max(1, Math.round(secs / 60)) : 30;
      setIsCustom(true);
      setCustomMins(String(mins));
      save(mins * 60);
    } else {
      setIsCustom(false);
      save(Number(value));
    }
  }

  function saveCustom() {
    const mins = Math.max(1, Math.floor(Number(customMins) || 0));
    setCustomMins(String(mins));
    save(mins * 60);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-label font-bold uppercase tracking-widest text-outline">Feed Syncing</h2>
      <div className="border border-outline-variant/40 p-5 space-y-3">
        <div>
          <p className="text-sm font-headline font-semibold text-on-surface">Auto-refresh interval</p>
          <p className="text-xs font-body text-on-surface-variant mt-0.5">
            How often Feedlight checks your feeds for new articles in the background.
            "Manual only" turns off auto-refresh — you can still refresh anytime with the
            toolbar button. Changes take effect within a minute.
          </p>
        </div>
        <select
          value={isCustom ? "custom" : String(secs)}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">
          {SYNC_PRESETS.map((p) => <option key={p.secs} value={p.secs}>{p.label}</option>)}
          <option value="custom">Custom…</option>
        </select>
        {isCustom && (
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} value={customMins}
              onChange={(e) => setCustomMins(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveCustom(); }}
              className="w-24 ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface focus:outline-none focus:ring-1 focus:ring-primary" />
            <span className="text-xs font-body text-on-surface-variant">minutes</span>
            <button onClick={saveCustom}
              className="ml-auto shrink-0 bg-primary-container px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-on-primary-container transition-opacity hover:opacity-90">
              Set
            </button>
          </div>
        )}
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
  { value: "elevenlabs", label: "ElevenLabs", description: "Premium · paid" },
];

const ELEVEN_MODELS: { value: string; label: string; hint: string }[] = [
  { value: "eleven_turbo_v2_5", label: "Turbo v2.5", hint: "Fast, ~½ credits" },
  { value: "eleven_flash_v2_5", label: "Flash v2.5", hint: "Fastest, ~½ credits" },
  { value: "eleven_multilingual_v2", label: "Multilingual v2", hint: "Highest quality" },
];

type ElevenVoice = { voice_id: string; name: string; category?: string };

function ElevenLabsVoiceSettings() {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [keySave, setKeySave] = useState<SaveState>("idle");
  const [voices, setVoices] = useState<ElevenVoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [model, setModel] = useState(ELEVENLABS_DEFAULT_MODEL);

  useEffect(() => {
    getElevenLabsApiKey().then((k) => setHasKey(!!k.trim())).catch(console.error);
    getElevenLabsVoice().then((v) => { if (v) setVoiceId(v.id); }).catch(console.error);
    getElevenLabsModel().then(setModel).catch(console.error);
  }, []);

  function chooseVoice(v: ElevenVoice) {
    setVoiceId(v.voice_id);
    setElevenLabsVoice({ id: v.voice_id, name: v.name }).catch(console.error);
  }

  async function loadVoices() {
    setLoading(true);
    setError(null);
    try {
      const list = await invoke<ElevenVoice[]>("list_elevenlabs_voices");
      list.sort((a, b) => a.name.localeCompare(b.name));
      setVoices(list);
      if (!voiceId && list[0]) chooseVoice(list[0]);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveKey() {
    const trimmed = key.trim();
    if (!trimmed) return;
    setKeySave("saving");
    try {
      await setElevenLabsApiKey(trimmed);
      setHasKey(true);
      setKey("");
      setKeySave("saved");
      setTimeout(() => setKeySave("idle"), 2000);
      loadVoices();
    } catch {
      setKeySave("error");
    }
  }

  function chooseModel(m: string) {
    setModel(m);
    setElevenLabsModel(m).catch(console.error);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-headline font-semibold text-on-surface">ElevenLabs API Key</p>
        <p className="text-xs font-body text-on-surface-variant">
          Create a key at elevenlabs.io → Profile → API Keys, then paste it here. ElevenLabs is a
          paid, premium voice — billed per character to your own account.
        </p>
        <div className="flex gap-2">
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={hasKey ? "••••••••  saved — enter a new key to replace" : "sk_..."}
            className="flex-1 ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={saveKey} disabled={keySave === "saving"}
            className="shrink-0 bg-primary-container px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-on-primary-container transition-opacity hover:opacity-90 disabled:opacity-40">
            {keySave === "saving" ? "Saving…" : keySave === "saved" ? "Saved ✓" : keySave === "error" ? "Error" : "Save"}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-headline font-semibold text-on-surface">Model</p>
        <select value={model} onChange={(e) => chooseModel(e.target.value)}
          className="w-full ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">
          {ELEVEN_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-headline font-semibold text-on-surface">Voice</p>
          <button onClick={loadVoices} disabled={loading || (!hasKey && !key.trim())}
            className="shrink-0 ghost-border px-3 py-1.5 text-[10px] font-label font-bold uppercase tracking-widest text-on-surface-variant transition-opacity hover:opacity-90 disabled:opacity-40">
            {loading ? "Loading…" : voices ? "Reload" : "Load voices"}
          </button>
        </div>
        {!voices && !error && (
          <p className="text-xs font-body text-on-surface-variant">
            {hasKey ? "Load voices to choose one." : "Save your API key to load voices."}
          </p>
        )}
        {voices && (
          <select value={voiceId} onChange={(e) => { const v = voices.find((x) => x.voice_id === e.target.value); if (v) chooseVoice(v); }}
            className="w-full ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface focus:outline-none focus:ring-1 focus:ring-primary">
            {voices.map((v) => <option key={v.voice_id} value={v.voice_id}>{v.name}{v.category ? ` · ${v.category}` : ""}</option>)}
          </select>
        )}
        {error && <p className="text-[11px] font-body text-error">✗ {error}</p>}
      </div>
    </div>
  );
}

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
            System voices are free and work offline. Google Cloud is higher quality and cheap
            (largely free for personal use). ElevenLabs is the most natural voice but paid — both use
            your own API key.
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

        {engine === "system" && (
          <p className="text-xs font-body text-on-surface-variant">
            Uses your Mac's built-in speech voices. Pick or download higher-quality system voices in
            macOS System Settings → Accessibility → Spoken Content → System Voice.
          </p>
        )}

        {engine === "elevenlabs" && <ElevenLabsVoiceSettings />}

        {engine === "google" && (
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

type ResetState = "idle" | "backing-up" | "erasing" | "error";

function DangerZoneSection() {
  const [confirmText, setConfirmText] = useState("");
  const [state, setState] = useState<ResetState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const armed = confirmText.trim().toLowerCase() === "confirm";
  const busy = state === "backing-up" || state === "erasing";

  async function handleReset() {
    if (!armed || busy) return;
    setErrorMsg("");
    // Back up feeds first — if this fails, abort without erasing anything.
    setState("backing-up");
    try {
      await exportFeedsToOpml();
    } catch (err) {
      setState("error");
      setErrorMsg(`Backup failed, nothing was erased: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    setState("erasing");
    try {
      await eraseAllData();
      await resetSettings();
      window.location.reload();
    } catch (err) {
      setState("error");
      setErrorMsg(`Reset failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[10px] font-label font-bold uppercase tracking-widest text-error">Danger Zone</h2>
      <div className="border border-error/40 p-5 space-y-4">
        <div>
          <p className="text-sm font-headline font-semibold text-on-surface">Factory Reset</p>
          <p className="text-xs font-body text-on-surface-variant mt-0.5">
            Permanently erases all feeds, articles, read state, highlights, settings, and API keys —
            returning the app to its first-launch state. A backup of your feed list (.opml) is
            downloaded automatically before erasing, so you can re-import it later.
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-body text-on-surface-variant">
            Type <code className="bg-surface-container px-1 py-0.5 rounded text-[11px] text-on-surface">confirm</code> to enable the button.
          </label>
          <div className="flex gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="confirm"
              disabled={busy}
              className="flex-1 ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-error disabled:opacity-50"
            />
            <button
              onClick={handleReset}
              disabled={!armed || busy}
              className="shrink-0 bg-error px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-background transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              {state === "backing-up" ? "Backing up…" : state === "erasing" ? "Erasing…" : "Erase all data & reset"}
            </button>
          </div>
        </div>
        {state === "error" && <p className="text-[11px] font-body text-error">✗ {errorMsg}</p>}
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

  async function persistVaultPath(next: string) {
    setVaultSave("saving");
    try { await setObsidianVaultPath(next); setVaultPath(next); setVaultSave("saved"); setTimeout(() => setVaultSave("idle"), 2000); }
    catch { setVaultSave("error"); }
  }

  async function chooseVaultFolder() {
    const selected = await open({ directory: true, title: "Choose Obsidian vault folder" });
    if (typeof selected === "string") await persistVaultPath(selected);
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

          <FeedSyncingSection />

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
            <div className="border border-outline-variant/40 p-5 space-y-3">
              <div>
                <p className="text-sm font-headline font-semibold text-on-surface">Obsidian Vault Folder</p>
                <p className="text-xs font-body text-on-surface-variant mt-0.5">
                  Choose a folder inside your vault. "Send to Obsidian" writes one markdown file per article with your highlights and notes.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="flex-1 truncate ghost-border bg-surface-container-low px-3 py-2 text-xs font-body text-on-surface" title={vaultPath || undefined}>
                  {vaultPath || <span className="text-outline">No folder selected</span>}
                </p>
                <button onClick={chooseVaultFolder} disabled={vaultSave === "saving"}
                  className="shrink-0 bg-primary-container px-4 py-2 text-[11px] font-label font-bold uppercase tracking-widest text-on-primary-container transition-opacity hover:opacity-90 disabled:opacity-40">
                  {vaultSave === "saving" ? "Saving…" : vaultSave === "saved" ? "Saved ✓" : vaultSave === "error" ? "Error" : "Choose Folder…"}
                </button>
                {vaultPath && (
                  <button onClick={() => persistVaultPath("")} disabled={vaultSave === "saving"}
                    className="shrink-0 px-2 py-2 text-[11px] font-label text-on-surface-variant transition-colors hover:text-error disabled:opacity-40">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </section>

          <DangerZoneSection />

        </div>
      </div>
    </div>
  );
}
