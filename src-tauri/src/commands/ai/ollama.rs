use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use super::provider::{AiConfig, ChatMessage};
use crate::commands::credentials::{read_secret, ERR_NO_KEY};

#[derive(Deserialize)]
struct TagsResponse {
    #[serde(default)]
    models: Vec<TagModel>,
}

#[derive(Deserialize)]
struct TagModel {
    name: String,
    #[serde(default)]
    size: Option<u64>,
    #[serde(default)]
    details: Option<ModelDetails>,
    #[serde(default)]
    modified_at: Option<String>,
}

#[derive(Deserialize)]
struct ModelDetails {
    #[serde(default)]
    parameter_size: Option<String>,
    #[serde(default)]
    quantization_level: Option<String>,
}

/// One installed Ollama model, shaped for the Settings model picker. `size_mb`
/// is rounded from the byte count Ollama reports; the detail fields are absent
/// on older Ollama versions, so the UI treats them as optional decoration.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModel {
    pub name: String,
    pub size_mb: Option<u64>,
    pub parameter_size: Option<String>,
    pub quantization: Option<String>,
    pub modified_at: Option<String>,
}

#[derive(Serialize)]
struct GenerateRequest<'a> {
    model: &'a str,
    prompt: String,
    stream: bool,
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: String,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    content: String,
}

#[derive(Deserialize)]
struct GenerateStreamChunk {
    #[serde(default)]
    response: String,
}

#[derive(Deserialize)]
struct ChatStreamChunk {
    message: Option<ChatResponseMessage>,
}

fn client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| e.to_string())
}

/// Ollama on localhost normally needs no credentials, but a protected instance
/// (a reverse proxy, another machine on the LAN, ollama.com) does. The token is
/// stored in the keychain like every other key, so it never crosses IPC.
///
/// No stored key means no header: plain local setups are unaffected, and an
/// instance that ignores `Authorization` still works.
fn auth_token() -> Result<Option<String>, String> {
    match read_secret("ollama_api_key") {
        Ok(token) => Ok(Some(token)),
        Err(e) if e == ERR_NO_KEY => Ok(None),
        Err(e) => Err(e),
    }
}

/// Applies the bearer header to a request builder when a token is stored.
fn with_auth(req: reqwest::RequestBuilder) -> Result<reqwest::RequestBuilder, String> {
    Ok(match auth_token()? {
        Some(token) => req.bearer_auth(token),
        None => req,
    })
}

/// Turns a failed status into something the user can act on. On a local
/// instance 401/403 nearly always means a key is stored that the instance does
/// not want, or a key is missing that it does.
fn status_error(status: reqwest::StatusCode) -> String {
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return format!(
            "Ollama rejected the request ({status}). If this instance requires a key, save it under AI \u{203a} API key; if it does not, clear the key."
        );
    }
    format!("Ollama returned HTTP {status}")
}

/// Reads an NDJSON streaming response line by line, buffering across chunk
/// boundaries (a JSON line or UTF-8 sequence may be split between chunks).
async fn read_ndjson_lines<F: FnMut(&str)>(
    resp: &mut reqwest::Response,
    mut on_line: F,
) -> Result<(), String> {
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Stream error: {e}"))?
    {
        buf.extend_from_slice(&chunk);
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line_bytes);
            let line = line.trim();
            if !line.is_empty() {
                on_line(line);
            }
        }
    }
    if !buf.is_empty() {
        let line = String::from_utf8_lossy(&buf);
        let line = line.trim();
        if !line.is_empty() {
            on_line(line);
        }
    }
    Ok(())
}

/// Lists the models installed on an Ollama instance, newest name first.
pub async fn list_models(base_url: &str) -> Result<Vec<OllamaModel>, String> {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let resp = with_auth(client(5)?.get(&url))?
        .send()
        .await
        .map_err(|e| format!("Cannot reach Ollama: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(status_error(status));
    }

    let tags: TagsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))?;

    Ok(map_tag_models(tags.models))
}

/// Turns Ollama's `/api/tags` entries into picker rows. Bytes become MB rounded
/// up, and the optional `details` block is flattened — older Ollama versions
/// omit it, which must not fail the whole listing.
fn map_tag_models(models: Vec<TagModel>) -> Vec<OllamaModel> {
    let mut mapped: Vec<OllamaModel> = models
        .into_iter()
        .map(|m| OllamaModel {
            size_mb: m.size.map(|bytes| (bytes + 999_999) / 1_000_000),
            parameter_size: m
                .details
                .as_ref()
                .and_then(|d| d.parameter_size.clone()),
            quantization: m
                .details
                .as_ref()
                .and_then(|d| d.quantization_level.clone()),
            modified_at: m.modified_at,
            name: m.name,
        })
        .collect();
    mapped.sort_by(|a, b| a.name.cmp(&b.name));
    mapped
}

pub async fn complete(cfg: &AiConfig, prompt: String, timeout_secs: u64) -> Result<String, String> {
    let url = format!("{}/api/generate", cfg.ollama_url());
    let body = GenerateRequest {
        model: &cfg.model,
        prompt,
        stream: false,
    };

    let resp = with_auth(client(timeout_secs)?.post(&url).json(&body))?
        .send()
        .await
        .map_err(|e| format!("Failed to reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        return Err(status_error(resp.status()));
    }

    let result: GenerateResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))?;

    Ok(result.response.trim().to_string())
}

pub async fn complete_stream(
    cfg: &AiConfig,
    prompt: String,
    timeout_secs: u64,
    on_token: &Channel<String>,
) -> Result<String, String> {
    let url = format!("{}/api/generate", cfg.ollama_url());
    let body = GenerateRequest {
        model: &cfg.model,
        prompt,
        stream: true,
    };

    let mut resp = with_auth(client(timeout_secs)?.post(&url).json(&body))?
        .send()
        .await
        .map_err(|e| format!("Failed to reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        return Err(status_error(resp.status()));
    }

    let mut full = String::new();
    read_ndjson_lines(&mut resp, |line| {
        if let Ok(chunk) = serde_json::from_str::<GenerateStreamChunk>(line) {
            if !chunk.response.is_empty() {
                full.push_str(&chunk.response);
                let _ = on_token.send(chunk.response);
            }
        }
    })
    .await?;

    Ok(full.trim().to_string())
}

pub async fn chat_stream(
    cfg: &AiConfig,
    system: String,
    history: Vec<ChatMessage>,
    question: String,
    timeout_secs: u64,
    on_token: &Channel<String>,
) -> Result<String, String> {
    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: system,
    }];
    messages.extend(history);
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: question,
    });

    let url = format!("{}/api/chat", cfg.ollama_url());
    let body = ChatRequest {
        model: &cfg.model,
        messages,
        stream: true,
    };

    let mut resp = with_auth(client(timeout_secs)?.post(&url).json(&body))?
        .send()
        .await
        .map_err(|e| format!("Failed to reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        return Err(status_error(resp.status()));
    }

    let mut full = String::new();
    read_ndjson_lines(&mut resp, |line| {
        if let Ok(chunk) = serde_json::from_str::<ChatStreamChunk>(line) {
            if let Some(msg) = chunk.message {
                if !msg.content.is_empty() {
                    full.push_str(&msg.content);
                    let _ = on_token.send(msg.content);
                }
            }
        }
    })
    .await?;

    Ok(full.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_tags(json: &str) -> Vec<OllamaModel> {
        map_tag_models(serde_json::from_str::<TagsResponse>(json).unwrap().models)
    }

    #[test]
    fn maps_a_real_tags_payload_including_details() {
        let models = parse_tags(
            r#"{"models":[{"name":"llama3.2:latest","model":"llama3.2:latest","size":2004158528,
            "details":{"parameter_size":"3B","quantization_level":"Q4_0"},
            "modified_at":"2026-01-02T10:00:00.000000000Z"}]}"#,
        );
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].name, "llama3.2:latest");
        assert_eq!(models[0].size_mb, Some(2005));
        assert_eq!(models[0].parameter_size.as_deref(), Some("3B"));
        assert_eq!(models[0].quantization.as_deref(), Some("Q4_0"));
        assert!(models[0].modified_at.is_some());
    }

    #[test]
    fn tolerates_older_ollama_without_a_details_block() {
        let models = parse_tags(r#"{"models":[{"name":"mistral","size":4000000000}]}"#);
        assert_eq!(models[0].parameter_size, None);
        assert_eq!(models[0].quantization, None);
        assert_eq!(models[0].modified_at, None);
    }

    #[test]
    fn tolerates_a_missing_or_empty_model_list() {
        assert!(parse_tags(r#"{"models":[]}"#).is_empty());
        assert!(parse_tags("{}").is_empty());
    }

    #[test]
    fn rounds_bytes_up_to_megabytes_so_a_model_is_never_shown_as_zero() {
        let models = parse_tags(r#"{"models":[{"name":"tiny","size":1}]}"#);
        assert_eq!(models[0].size_mb, Some(1));
    }

    #[test]
    fn sorts_by_name_so_the_picker_is_stable_across_refreshes() {
        let models = parse_tags(
            r#"{"models":[{"name":"phi3:mini"},{"name":"llama3.2:latest"},{"name":"mistral"}]}"#,
        );
        let names: Vec<&str> = models.iter().map(|m| m.name.as_str()).collect();
        assert_eq!(names, ["llama3.2:latest", "mistral", "phi3:mini"]);
    }

    #[test]
    fn auth_failures_point_at_the_settings_field_instead_of_a_bare_status() {
        for code in [401u16, 403] {
            let msg = status_error(reqwest::StatusCode::from_u16(code).unwrap());
            assert!(msg.contains("API key"), "{msg}");
        }
        let other = status_error(reqwest::StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(other, "Ollama returned HTTP 500 Internal Server Error");
    }
}
