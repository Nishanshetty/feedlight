use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use super::{gemini, ollama, openai};
use crate::commands::credentials::{read_secret_renamed, ERR_NO_KEY};

/// Default Local endpoint, used when the frontend sends an empty base URL.
const LOCAL_DEFAULT_URL: &str = "http://localhost:11434";

/// Keychain name of the Local provider's bearer token. Only the OpenAI-compatible
/// protocol uses it; the Ollama protocol has no key at all.
pub const LOCAL_KEY: &str = "local_ai_api_key";

/// Name this key had while the Local provider could only be Ollama, and while a
/// key was offered for that protocol too. Read once and moved forward, so nobody
/// has to re-paste a working key before switching to an OpenAI-compatible server.
pub const LOCAL_KEY_LEGACY: &str = "ollama_api_key";

/// Which backend answers AI requests. Mirrors `AiProvider` in `lib/settings.ts`.
/// It was `Ollama` while the Local provider could only mean Ollama; `Local` is
/// the name that covers both protocols. Which protocol it speaks is a separate
/// field, so this one never has to mean a specific server again.
#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Local,
    Gemini,
}

/// Which wire protocol the Local provider speaks. `ollama` is the default, so a
/// config written before this field existed keeps working unchanged.
#[derive(Deserialize, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum LocalProtocol {
    #[default]
    Ollama,
    /// Anything speaking the OpenAI chat-completions surface: llama.cpp's
    /// server, vLLM, LM Studio, OpenRouter — and Ollama's own `/v1` shim.
    OpenAi,
}

/// Everything a provider needs to service one request. `base_url` and
/// `protocol` only mean anything for the Local provider — Gemini reads its key
/// from the keychain, so no secret ever crosses the IPC boundary.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub provider: AiProvider,
    pub model: String,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub protocol: LocalProtocol,
}

impl AiConfig {
    fn trimmed_base_url(&self) -> Option<&str> {
        self.base_url
            .as_deref()
            .map(|u| u.trim().trim_end_matches('/'))
            .filter(|u| !u.is_empty())
    }

    pub fn local_url(&self) -> &str {
        self.trimmed_base_url().unwrap_or(LOCAL_DEFAULT_URL)
    }

    pub fn openai_url(&self) -> String {
        openai_base(self.trimmed_base_url())
    }
}

/// Base URL for the OpenAI surface, with `/v1` appended when it is missing.
/// llama.cpp, vLLM and LM Studio all mount the API under `/v1`, and people
/// habitually paste the bare host — so both spellings have to work.
pub fn openai_base(base_url: Option<&str>) -> String {
    let base = base_url
        .map(|u| u.trim().trim_end_matches('/'))
        .filter(|u| !u.is_empty())
        .unwrap_or(LOCAL_DEFAULT_URL);
    if base.ends_with("/v1") {
        base.to_string()
    } else {
        format!("{base}/v1")
    }
}

// ── Shared transport helpers for the Local provider ──────────────────────────

pub fn http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| e.to_string())
}

/// The bearer token for the OpenAI-compatible protocol. Absent means no header.
///
/// Only `openai.rs` calls this: Ollama's own API has no notion of a key, so the
/// Ollama protocol neither asks for one nor sends one. A token saved while the
/// OpenAI protocol was selected stays in the keychain, unused, and is there
/// again when the user switches back.
pub fn local_api_key() -> Result<Option<String>, String> {
    match read_secret_renamed(LOCAL_KEY_LEGACY, LOCAL_KEY) {
        Ok(key) => Ok(Some(key)),
        Err(e) if e == ERR_NO_KEY => Ok(None),
        Err(e) => Err(e),
    }
}

/// Applies the bearer header to a request builder when a token is stored.
pub fn with_auth(req: reqwest::RequestBuilder) -> Result<reqwest::RequestBuilder, String> {
    Ok(match local_api_key()? {
        Some(token) => req.bearer_auth(token),
        None => req,
    })
}

/// Turns a failed status into something the user can act on, worded for the
/// protocol that got it. 401/403 means a key problem only on the OpenAI surface:
/// Ollama sends no key at all, so there the honest advice is the URL and the
/// protocol switch. 404 means the URL points at something that is not this API.
pub fn status_error(status: reqwest::StatusCode, what: &str, protocol: LocalProtocol) -> String {
    match status.as_u16() {
        401 | 403 => match protocol {
            LocalProtocol::OpenAi => format!(
                "{what} rejected the request ({status}). If it requires a key, save it under AI \u{203a} API key; if it does not, clear the key."
            ),
            LocalProtocol::Ollama => format!(
                "{what} rejected the request ({status}). Ollama's own API needs no key — check the Local API URL, or switch the protocol to OpenAI-compatible if this server requires a key."
            ),
        },
        404 => format!(
            "{what} returned 404 at {status}. Check the Local API URL and protocol: an OpenAI-compatible server needs the OpenAI protocol, Ollama needs Ollama."
        ),
        _ => format!("{what} returned HTTP {status}"),
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// One model the Local provider offers, for the Settings picker. Every field
/// but `name` is decoration: Ollama reports size and quantisation, an
/// OpenAI-compatible server usually reports only an id.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalModel {
    pub name: String,
    pub size_mb: Option<u64>,
    pub parameter_size: Option<String>,
    pub quantization: Option<String>,
    pub modified_at: Option<String>,
    pub context_length: Option<u64>,
}

/// One-shot completion. Used by the features that parse structured output
/// (takeaways, suggested questions, digest, discover queries).
pub async fn complete(cfg: &AiConfig, prompt: String, timeout_secs: u64) -> Result<String, String> {
    match cfg.provider {
        AiProvider::Local => match cfg.protocol {
            LocalProtocol::Ollama => ollama::complete(cfg, prompt, timeout_secs).await,
            LocalProtocol::OpenAi => openai::complete(cfg, prompt, timeout_secs).await,
        },
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
        AiProvider::Local => match cfg.protocol {
            LocalProtocol::Ollama => ollama::complete_stream(cfg, prompt, timeout_secs, on_token).await,
            LocalProtocol::OpenAi => openai::complete_stream(cfg, prompt, timeout_secs, on_token).await,
        },
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
        AiProvider::Local => match cfg.protocol {
            LocalProtocol::Ollama => {
                ollama::chat_stream(cfg, system, history, question, timeout_secs, on_token).await
            }
            LocalProtocol::OpenAi => {
                openai::chat_stream(cfg, system, history, question, timeout_secs, on_token).await
            }
        },
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_plain_json_array() {
        assert_eq!(
            parse_json_array("[\"a\", \"b\", \"c\"]", "takeaways").unwrap(),
            ["a", "b", "c"]
        );
    }

    #[test]
    fn strips_prose_and_code_fences_around_the_array() {
        let raw = "Here are three takeaways:\n```json\n[\"one\", \"two\", \"three\"]\n```\nHope that helps.";
        assert_eq!(parse_json_array(raw, "takeaways").unwrap().len(), 3);
    }

    #[test]
    fn takes_the_widest_array_span_not_the_first_bracket_pair() {
        // A model that echoes the example from the prompt before answering.
        let raw = "[\"First.\"], example: [\"Second.\", \"Third.\"]";
        assert!(parse_json_array(raw, "takeaways").is_err());
        let good = "[\"First.\", \"Second.\"]";
        assert_eq!(parse_json_array(good, "takeaways").unwrap().len(), 2);
    }

    #[test]
    fn fails_with_the_feature_name_when_no_array_is_present() {
        let err = parse_json_array("no array here", "queries").unwrap_err();
        assert!(err.contains("queries"), "{err}");
    }

    #[test]
    fn an_empty_array_is_valid_and_not_an_error() {
        assert!(parse_json_array("[]", "suggestions").unwrap().is_empty());
    }
}

#[cfg(test)]
mod url_tests {
    use super::openai_base;

    #[test]
    fn appends_v1_to_a_bare_host_because_that_is_how_people_paste_it() {
        assert_eq!(openai_base(Some("http://192.168.0.109:8080")), "http://192.168.0.109:8080/v1");
    }

    #[test]
    fn keeps_v1_when_it_is_already_there() {
        assert_eq!(openai_base(Some("http://192.168.0.109:8080/v1")), "http://192.168.0.109:8080/v1");
    }

    #[test]
    fn tolerates_trailing_slashes_and_surrounding_spaces() {
        assert_eq!(openai_base(Some("  https://api.example.com/v1/  ")), "https://api.example.com/v1");
    }

    #[test]
    fn falls_back_to_the_local_ollama_port_when_the_field_is_empty() {
        assert_eq!(openai_base(None), "http://localhost:11434/v1");
        assert_eq!(openai_base(Some("   ")), "http://localhost:11434/v1");
    }
}
