use base64::{engine::general_purpose::STANDARD, Engine as _};
use security_framework::passwords::get_generic_password;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const SERVICE: &str = "app.feedlight";
const ERR_NOT_FOUND: i32 = -25300; // errSecItemNotFound

/// ElevenLabs defaults used when the user hasn't picked yet. "Rachel" is a
/// preset voice available on every account; Turbo is the cheaper/faster model.
const DEFAULT_ELEVEN_VOICE: &str = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_ELEVEN_MODEL: &str = "eleven_turbo_v2_5";

/// Sentinel error the frontend matches on to fall back to the system voice /
/// prompt the user to add a key in Settings. Keep this string stable.
const ERR_NO_KEY: &str = "no_api_key";

/// Used when the user hasn't picked a voice yet.
const DEFAULT_VOICE: &str = "en-US-Neural2-F";
const DEFAULT_LANG: &str = "en-US";

/// Reads the user's Google Cloud TTS API key from the system keychain.
fn api_key() -> Result<String, String> {
    match get_generic_password(SERVICE, "gcp_tts_api_key") {
        Ok(bytes) => {
            let key = String::from_utf8(bytes).map_err(|e| format!("Key encoding error: {e}"))?;
            if key.trim().is_empty() {
                Err(ERR_NO_KEY.to_string())
            } else {
                Ok(key)
            }
        }
        Err(e) if e.code() == ERR_NOT_FOUND => Err(ERR_NO_KEY.to_string()),
        Err(e) => Err(format!("Keychain error: {e}")),
    }
}

#[derive(Deserialize)]
struct TtsResponse {
    #[serde(rename = "audioContent")]
    audio_content: String,
}

/// A Google Cloud TTS voice, as returned by the `voices.list` endpoint and
/// surfaced to the voice picker in Settings.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Voice {
    name: String,
    language_codes: Vec<String>,
    ssml_gender: String,
    #[serde(default)]
    natural_sample_rate_hertz: Option<u32>,
}

#[derive(Deserialize)]
struct VoicesResponse {
    #[serde(default)]
    voices: Vec<Voice>,
}

/// Lists the Google Cloud TTS voices available to the user's API key.
#[tauri::command]
pub async fn list_tts_voices() -> Result<Vec<Voice>, String> {
    let key = api_key()?;
    let client = reqwest::Client::new();
    let resp = client
        .get("https://texttospeech.googleapis.com/v1/voices")
        .query(&[("key", key.as_str())])
        .send()
        .await
        .map_err(|e| format!("Voices request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Voices API error {status}: {body}"));
    }

    let parsed: VoicesResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse voices response: {e}"))?;
    Ok(parsed.voices)
}

/// Synthesizes text to MP3 using Google Cloud TTS and the user's API key,
/// returning base64-encoded audio. The selected voice (and its language code)
/// are read from the settings store; both fall back to a US English default.
#[tauri::command]
pub async fn synthesize_speech(text: String, app: AppHandle) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Text is empty".to_string());
    }

    let key = api_key()?;

    let store = app
        .store("settings.json")
        .map_err(|e| format!("Store error: {e}"))?;
    let voice = store
        .get("tts_voice")
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_VOICE.to_string());
    let lang = store
        .get("tts_voice_lang")
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_LANG.to_string());

    let body = serde_json::json!({
        "input": { "text": text.trim() },
        "voice": { "languageCode": lang, "name": voice },
        "audioConfig": { "audioEncoding": "MP3" }
    });

    let client = reqwest::Client::new();
    let resp = client
        .post("https://texttospeech.googleapis.com/v1/text:synthesize")
        .query(&[("key", key.as_str())])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("TTS API request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("TTS API error {status}: {err_body}"));
    }

    // Google returns the audio already base64-encoded; pass it straight through.
    let tts: TtsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse TTS response: {e}"))?;
    Ok(tts.audio_content)
}

// ─── ElevenLabs ─────────────────────────────────────────────────────────────────

/// Reads the user's ElevenLabs API key from the system keychain.
fn elevenlabs_key() -> Result<String, String> {
    match get_generic_password(SERVICE, "elevenlabs_api_key") {
        Ok(bytes) => {
            let key = String::from_utf8(bytes).map_err(|e| format!("Key encoding error: {e}"))?;
            if key.trim().is_empty() {
                Err(ERR_NO_KEY.to_string())
            } else {
                Ok(key)
            }
        }
        Err(e) if e.code() == ERR_NOT_FOUND => Err(ERR_NO_KEY.to_string()),
        Err(e) => Err(format!("Keychain error: {e}")),
    }
}

/// An ElevenLabs voice, surfaced to the voice picker in Settings.
#[derive(Serialize, Deserialize)]
pub struct ElevenVoice {
    voice_id: String,
    name: String,
    #[serde(default)]
    category: Option<String>,
}

#[derive(Deserialize)]
struct ElevenVoicesResponse {
    #[serde(default)]
    voices: Vec<ElevenVoice>,
}

/// Lists the ElevenLabs voices available to the user's API key.
#[tauri::command]
pub async fn list_elevenlabs_voices() -> Result<Vec<ElevenVoice>, String> {
    let key = elevenlabs_key()?;
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.elevenlabs.io/v1/voices")
        .header("xi-api-key", key)
        .send()
        .await
        .map_err(|e| format!("Voices request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs voices error {status}: {body}"));
    }

    let parsed: ElevenVoicesResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse voices response: {e}"))?;
    Ok(parsed.voices)
}

/// Synthesizes text to MP3 using ElevenLabs and the user's API key, returning
/// base64-encoded audio. Voice id and model are read from the settings store,
/// each falling back to a sensible default.
#[tauri::command]
pub async fn synthesize_speech_elevenlabs(text: String, app: AppHandle) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Text is empty".to_string());
    }

    let key = elevenlabs_key()?;

    let store = app
        .store("settings.json")
        .map_err(|e| format!("Store error: {e}"))?;
    let voice_id = store
        .get("elevenlabs_voice_id")
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ELEVEN_VOICE.to_string());
    let model = store
        .get("elevenlabs_model")
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ELEVEN_MODEL.to_string());

    let body = serde_json::json!({
        "text": text.trim(),
        "model_id": model,
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"))
        .header("xi-api-key", key)
        .query(&[("output_format", "mp3_44100_128")])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("TTS API request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs TTS error {status}: {err_body}"));
    }

    // ElevenLabs returns raw MP3 bytes; base64-encode for the webview <audio>.
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read audio: {e}"))?;
    Ok(STANDARD.encode(&bytes))
}
