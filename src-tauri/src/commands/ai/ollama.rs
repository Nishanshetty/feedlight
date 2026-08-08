use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use super::provider::{AiConfig, ChatMessage};

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<TagModel>,
}

#[derive(Deserialize)]
struct TagModel {
    name: String,
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

/// Lists the models installed on the user's Ollama instance.
pub async fn list_models(base_url: &str) -> Result<Vec<String>, String> {
    let url = format!("{}/api/tags", base_url.trim_end_matches('/'));
    let resp = client(5)?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Cannot reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama returned HTTP {}", resp.status()));
    }

    let tags: TagsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))?;

    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

pub async fn complete(cfg: &AiConfig, prompt: String, timeout_secs: u64) -> Result<String, String> {
    let url = format!("{}/api/generate", cfg.ollama_url());
    let body = GenerateRequest {
        model: &cfg.model,
        prompt,
        stream: false,
    };

    let resp = client(timeout_secs)?
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama returned HTTP {}", resp.status()));
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

    let mut resp = client(timeout_secs)?
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama returned HTTP {}", resp.status()));
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

    let mut resp = client(timeout_secs)?
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Ollama: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Ollama returned HTTP {}", resp.status()));
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
