use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use super::{gemini, ollama};

/// Default Ollama endpoint, used when the frontend sends an empty base URL.
const OLLAMA_DEFAULT_URL: &str = "http://localhost:11434";

/// Which backend answers AI requests. Mirrors `AiProvider` in `lib/settings.ts`.
#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Ollama,
    Gemini,
}

/// Everything a provider needs to service one request. `base_url` only means
/// anything for Ollama — Gemini reads its key from the keychain, so no secret
/// ever crosses the IPC boundary.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub provider: AiProvider,
    pub model: String,
    #[serde(default)]
    pub base_url: Option<String>,
}

impl AiConfig {
    pub fn ollama_url(&self) -> &str {
        self.base_url
            .as_deref()
            .map(|u| u.trim().trim_end_matches('/'))
            .filter(|u| !u.is_empty())
            .unwrap_or(OLLAMA_DEFAULT_URL)
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// One-shot completion. Used by the features that parse structured output
/// (takeaways, suggested questions, digest, discover queries).
pub async fn complete(cfg: &AiConfig, prompt: String, timeout_secs: u64) -> Result<String, String> {
    match cfg.provider {
        AiProvider::Ollama => ollama::complete(cfg, prompt, timeout_secs).await,
        AiProvider::Gemini => gemini::complete(cfg, prompt, timeout_secs).await,
    }
}

/// Token-by-token completion. Each token is pushed to `on_token` as it arrives;
/// the accumulated text is also returned so callers don't have to reassemble it.
pub async fn complete_stream(
    cfg: &AiConfig,
    prompt: String,
    timeout_secs: u64,
    on_token: &Channel<String>,
) -> Result<String, String> {
    match cfg.provider {
        AiProvider::Ollama => ollama::complete_stream(cfg, prompt, timeout_secs, on_token).await,
        AiProvider::Gemini => gemini::complete_stream(cfg, prompt, timeout_secs, on_token).await,
    }
}

/// Multi-turn chat with a system prompt. `history` alternates user/assistant and
/// excludes `question`, which is appended as the final user turn.
pub async fn chat_stream(
    cfg: &AiConfig,
    system: String,
    history: Vec<ChatMessage>,
    question: String,
    timeout_secs: u64,
    on_token: &Channel<String>,
) -> Result<String, String> {
    match cfg.provider {
        AiProvider::Ollama => {
            ollama::chat_stream(cfg, system, history, question, timeout_secs, on_token).await
        }
        AiProvider::Gemini => {
            gemini::chat_stream(cfg, system, history, question, timeout_secs, on_token).await
        }
    }
}

/// Extracts a JSON array from a model response, tolerating prose or code fences
/// around it. Shared by every feature that asks for `["a", "b", "c"]` back.
pub fn parse_json_array(raw: &str, what: &str) -> Result<Vec<String>, String> {
    let raw = raw.trim();
    let start = raw
        .find('[')
        .ok_or_else(|| format!("No JSON array in response for {what}"))?;
    let end = raw
        .rfind(']')
        .ok_or_else(|| format!("No JSON array in response for {what}"))?;
    if end < start {
        return Err(format!("No JSON array in response for {what}"));
    }
    serde_json::from_str(&raw[start..=end]).map_err(|e| format!("Could not parse {what}: {e}"))
}
