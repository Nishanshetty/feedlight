//! Transport for anything speaking the OpenAI chat-completions surface:
//! llama.cpp's server, vLLM, LM Studio, OpenRouter, and Ollama's own `/v1`
//! shim. Selected by `protocol: "openai"` on the Local provider.
//!
//! Only `content` is read out of a message. Reasoning models on this surface
//! stream their chain of thought in a sibling `reasoning_content` field, and
//! forwarding that into the reader would show the user their model thinking
//! out loud.

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use super::provider::{
    http_client, openai_base, status_error, with_auth, AiConfig, ChatMessage, LocalModel,
};

const WHAT: &str = "The server";

#[derive(Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
    /// llama.cpp reports `meta.n_ctx`; vLLM and others report nothing here.
    #[serde(default)]
    meta: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Deserialize)]
struct ChatMessageBody {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Deserialize)]
struct ChatChoice {
    #[serde(default)]
    message: Option<ChatMessageBody>,
    #[serde(default)]
    delta: Option<ChatMessageBody>,
}

#[derive(Deserialize)]
struct ChatResponse {
    #[serde(default)]
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ErrorBody {
    message: Option<String>,
}

/// One line taken out of an SSE stream. `Skip` covers blank separators,
/// `event:`/`id:` fields and `: keep-alive` comments — all of which some
/// servers send and none of which carry a token.
#[derive(Debug, PartialEq)]
enum SseLine {
    Data(String),
    Done,
    Skip,
}

/// Pulls the next complete line out of the buffer, leaving a partial tail in
/// place until the next chunk arrives. This is the whole reason the buffer
/// exists: reqwest chunks on network boundaries, not on newlines.
fn take_sse_line(buf: &mut Vec<u8>) -> Option<SseLine> {
    let pos = buf.iter().position(|&b| b == b'\n')?;
    let bytes: Vec<u8> = buf.drain(..=pos).collect();
    let line = String::from_utf8_lossy(&bytes);
    let Some(payload) = line.trim().strip_prefix("data:") else {
        return Some(SseLine::Skip);
    };
    let payload = payload.trim();
    if payload == "[DONE]" {
        return Some(SseLine::Done);
    }
    if payload.is_empty() {
        return Some(SseLine::Skip);
    }
    Some(SseLine::Data(payload.to_string()))
}

/// Reads an SSE body and hands every `data:` payload to `on_event`, buffering
/// across chunk boundaries. `[DONE]` is the terminator, not an event.
async fn read_sse_data<F: FnMut(&str)>(resp: &mut reqwest::Response, mut on_event: F) -> Result<(), String> {
    let mut buf: Vec<u8> = Vec::new();
    let mut done = false;
    while !done {
        let chunk = resp
            .chunk()
            .await
            .map_err(|e| format!("Stream error: {e}"))?;
        let Some(chunk) = chunk else { break };
        buf.extend_from_slice(&chunk);
        while let Some(line) = take_sse_line(&mut buf) {
            match line {
                SseLine::Data(payload) => on_event(&payload),
                SseLine::Done => {
                    done = true;
                    break;
                }
                SseLine::Skip => {}
            }
        }
    }
    Ok(())
}

/// Turns an OpenAI-shaped error body into the message the server actually
/// meant, instead of a bare status.
async fn http_error(resp: reqwest::Response) -> String {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    let detail = serde_json::from_str::<ErrorBody>(&body)
        .ok()
        .and_then(|e| e.message)
        .map(|m| format!(" — {m}"))
        .unwrap_or_default();
    format!("{}{detail}", status_error(status, WHAT))
}

fn first_choice_text(parsed: &ChatResponse) -> String {
    parsed
        .choices
        .first()
        .and_then(|c| c.message.as_ref())
        .and_then(|m| m.content.clone())
        .unwrap_or_default()
}

/// Lists the models the server exposes. `n_ctx` is carried through as the only
/// detail this surface reliably has; most servers report just an id.
pub async fn list_models(base_url: &str) -> Result<Vec<LocalModel>, String> {
    let url = format!("{}/models", openai_base(Some(base_url)));
    let resp = with_auth(http_client(10)?.get(&url))?
        .send()
        .await
        .map_err(|e| format!("Cannot reach the server: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(http_error(resp).await);
    }

    let parsed: ModelsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))?;

    let mut models: Vec<LocalModel> = parsed
        .data
        .into_iter()
        .map(|m| LocalModel {
            name: m.id,
            size_mb: None,
            parameter_size: None,
            quantization: None,
            modified_at: None,
            context_length: m
                .meta
                .as_ref()
                .and_then(|v| v.get("n_ctx"))
                .and_then(|v| v.as_u64()),
        })
        .collect();
    models.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(models)
}

async fn post(
    cfg: &AiConfig,
    body: ChatRequest<'_>,
    timeout_secs: u64,
) -> Result<reqwest::Response, String> {
    let url = format!("{}/chat/completions", cfg.openai_url());
    let resp = with_auth(http_client(timeout_secs)?.post(&url).json(&body))?
        .send()
        .await
        .map_err(|e| format!("Failed to reach the server: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(http_error(resp).await);
    }
    Ok(resp)
}

pub async fn complete(cfg: &AiConfig, prompt: String, timeout_secs: u64) -> Result<String, String> {
    let body = ChatRequest {
        model: &cfg.model,
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        stream: false,
    };

    let resp = post(cfg, body, timeout_secs).await?;
    let parsed: ChatResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))?;

    Ok(first_choice_text(&parsed).trim().to_string())
}

pub async fn complete_stream(
    cfg: &AiConfig,
    prompt: String,
    timeout_secs: u64,
    on_token: &Channel<String>,
) -> Result<String, String> {
    let body = ChatRequest {
        model: &cfg.model,
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        stream: true,
    };

    let mut resp = post(cfg, body, timeout_secs).await?;
    stream_into(&mut resp, on_token).await
}

pub async fn chat_stream(
    cfg: &AiConfig,
    system: String,
    history: Vec<ChatMessage>,
    question: String,
    timeout_secs: u64,
    on_token: &Channel<String>,
) -> Result<String, String> {
    // This surface keeps the system prompt in band, as the first message.
    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: system,
    }];
    messages.extend(history);
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: question,
    });

    let body = ChatRequest {
        model: &cfg.model,
        messages,
        stream: true,
    };

    let mut resp = post(cfg, body, timeout_secs).await?;
    stream_into(&mut resp, on_token).await
}

async fn stream_into(
    resp: &mut reqwest::Response,
    on_token: &Channel<String>,
) -> Result<String, String> {
    let mut full = String::new();
    read_sse_data(resp, |payload| {
        let Ok(chunk) = serde_json::from_str::<ChatResponse>(payload) else {
            return;
        };
        let text = chunk
            .choices
            .first()
            .and_then(|c| c.delta.as_ref())
            .and_then(|d| d.content.clone())
            .unwrap_or_default();
        if !text.is_empty() {
            full.push_str(&text);
            let _ = on_token.send(text);
        }
    })
    .await?;
    Ok(full.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn drain(buf: &mut Vec<u8>) -> Vec<SseLine> {
        let mut out = Vec::new();
        while let Some(line) = take_sse_line(buf) {
            let done = line == SseLine::Done;
            out.push(line);
            if done {
                break;
            }
        }
        out
    }

    #[test]
    fn splits_a_stream_chunked_mid_line() {
        // One event delivered as three network chunks.
        let mut buf = Vec::new();
        buf.extend_from_slice(b"data: {\"choices\":[{\"del");
        assert_eq!(drain(&mut buf), vec![]);
        buf.extend_from_slice(b"ta\":{\"content\":\"Hel");
        assert_eq!(drain(&mut buf), vec![]);
        buf.extend_from_slice(b"lo\"}]}\n\n");
        // The blank separator that closes an event is its own line.
        assert_eq!(
            drain(&mut buf),
            vec![
                SseLine::Data("{\"choices\":[{\"delta\":{\"content\":\"Hello\"}]}".into()),
                SseLine::Skip,
            ]
        );
    }

    #[test]
    fn ignores_keep_alive_comments_and_blank_separators() {
        let mut buf = Vec::new();
        buf.extend_from_slice(b": keep-alive\n\nid: 7\nevent: message\n");
        assert_eq!(
            drain(&mut buf),
            vec![SseLine::Skip, SseLine::Skip, SseLine::Skip, SseLine::Skip]
        );
    }

    #[test]
    fn done_ends_the_pass_so_a_trailing_event_is_never_delivered() {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"data: [DONE]\n\ndata: {\"late\":true}\n");
        assert_eq!(drain(&mut buf), vec![SseLine::Done]);
        assert!(String::from_utf8_lossy(&buf).contains("late"));
    }

    #[test]
    fn reads_the_assistant_text_out_of_a_completion() {
        let parsed: ChatResponse = serde_json::from_str(
            r#"{"choices":[{"message":{"role":"assistant","content":"  Answer.  "}}]}"#,
        )
        .unwrap();
        assert_eq!(first_choice_text(&parsed), "  Answer.  ");
    }

    #[test]
    fn reasoning_content_is_not_read_as_the_answer() {
        // llama.cpp streams chain-of-thought in a sibling field; forwarding it
        // would show the user the model thinking out loud.
        let parsed: ChatResponse = serde_json::from_str(
            r#"{"choices":[{"delta":{"reasoning_content":"hmm","content":"Hi"}}]}"#,
        )
        .unwrap();
        let text = parsed
            .choices
            .first()
            .and_then(|c| c.delta.as_ref())
            .and_then(|d| d.content.clone())
            .unwrap();
        assert_eq!(text, "Hi");
    }

    #[test]
    fn lists_models_and_carries_the_context_window() {
        let parsed: ModelsResponse = serde_json::from_str(
            r#"{"object":"list","data":[{"id":"qwen3.8-flash","meta":{"n_ctx":131072}},{"id":"other"}]}"#,
        )
        .unwrap();
        let models: Vec<LocalModel> = parsed
            .data
            .into_iter()
            .map(|m| LocalModel {
                name: m.id,
                size_mb: None,
                parameter_size: None,
                quantization: None,
                modified_at: None,
                context_length: m
                    .meta
                    .as_ref()
                    .and_then(|v| v.get("n_ctx"))
                    .and_then(|v| v.as_u64()),
            })
            .collect();
        assert_eq!(models[0].context_length, Some(131072));
        assert_eq!(models[1].context_length, None);
    }
}
