use security_framework::passwords::get_generic_password;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

use super::provider::{AiConfig, ChatMessage};

const SERVICE: &str = "app.feedlight";
const ERR_NOT_FOUND: i32 = -25300; // errSecItemNotFound
const API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";

/// Sentinel the frontend matches on to point the user at Settings. Keep stable —
/// mirrors the same constant in `tts.rs`.
const ERR_NO_KEY: &str = "no_api_key";

/// Reads the user's Gemini API key from the system keychain. Stored there by
/// `set_credential`, so it never travels over IPC with a request.
fn api_key() -> Result<String, String> {
    match get_generic_password(SERVICE, "gemini_api_key") {
        Ok(bytes) => {
            let key = String::from_utf8(bytes).map_err(|e| format!("Key encoding error: {e}"))?;
            // Trim before returning, not just before the check: a pasted key with
            // a trailing newline would otherwise reach the query string verbatim
            // and come back as an opaque auth failure.
            let key = key.trim().to_string();
            if key.is_empty() {
                Err(ERR_NO_KEY.to_string())
            } else {
                Ok(key)
            }
        }
        Err(e) if e.code() == ERR_NOT_FOUND => Err(ERR_NO_KEY.to_string()),
        Err(e) => Err(format!("Keychain error: {e}")),
    }
}

fn client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| e.to_string())
}

// ── Wire types ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct Part {
    text: String,
}

#[derive(Serialize)]
struct Content {
    role: &'static str,
    parts: Vec<Part>,
}

#[derive(Serialize)]
struct SystemInstruction {
    parts: Vec<Part>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateRequest {
    contents: Vec<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<SystemInstruction>,
}

#[derive(Deserialize)]
struct RespPart {
    #[serde(default)]
    text: Option<String>,
}

#[derive(Deserialize)]
struct RespContent {
    #[serde(default)]
    parts: Vec<RespPart>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Candidate {
    #[serde(default)]
    content: Option<RespContent>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromptFeedback {
    #[serde(default)]
    block_reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GenerateResponse {
    #[serde(default)]
    candidates: Vec<Candidate>,
    #[serde(default)]
    prompt_feedback: Option<PromptFeedback>,
}

#[derive(Deserialize)]
struct ApiError {
    message: String,
}

#[derive(Deserialize)]
struct ApiErrorEnvelope {
    error: ApiError,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Turns a failed response into the most useful message we can get. Gemini puts
/// the real reason (bad key, unknown model, quota) in a JSON error envelope, so
/// prefer that over the bare status code.
async fn http_error(resp: reqwest::Response) -> String {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    match serde_json::from_str::<ApiErrorEnvelope>(&body) {
        Ok(env) => format!("Gemini: {}", env.error.message),
        Err(_) => format!("Gemini returned HTTP {status}"),
    }
}

/// Concatenates the text parts of the first candidate, if any.
fn candidate_text(resp: &GenerateResponse) -> String {
    resp.candidates
        .first()
        .and_then(|c| c.content.as_ref())
        .map(|c| {
            c.parts
                .iter()
                .filter_map(|p| p.text.as_deref())
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// A finish reason that means the output is unusable, as opposed to `STOP` (done)
/// or `MAX_TOKENS` (truncated but still worth showing).
fn fatal_finish_reason(reason: &str) -> bool {
    !matches!(reason, "STOP" | "MAX_TOKENS" | "FINISH_REASON_UNSPECIFIED")
}

/// Gemini can answer HTTP 200 and then refuse — a blocked prompt or a non-STOP
/// finish reason with no text. Turn that into a real error instead of letting
/// the caller show an empty summary.
fn check_refusal(resp: &GenerateResponse, text: &str) -> Result<(), String> {
    if let Some(reason) = resp
        .prompt_feedback
        .as_ref()
        .and_then(|f| f.block_reason.as_deref())
    {
        return Err(format!("Gemini blocked this request ({reason})"));
    }
    if text.is_empty() {
        if let Some(reason) = resp.candidates.first().and_then(|c| c.finish_reason.as_deref()) {
            if fatal_finish_reason(reason) {
                return Err(format!("Gemini returned no output ({reason})"));
            }
        }
    }
    Ok(())
}

fn build_body(system: Option<String>, contents: Vec<Content>) -> GenerateRequest {
    GenerateRequest {
        contents,
        system_instruction: system.map(|text| SystemInstruction {
            parts: vec![Part { text }],
        }),
    }
}

fn user_turn(text: String) -> Content {
    Content {
        role: "user",
        parts: vec![Part { text }],
    }
}

/// Reads an SSE stream, handing each `data:` payload to `on_event`. Buffers
/// across chunk boundaries the same way the Ollama NDJSON reader does.
async fn read_sse_events<F: FnMut(&str)>(
    resp: &mut reqwest::Response,
    mut on_event: F,
) -> Result<(), String> {
    let mut buf: Vec<u8> = Vec::new();
    let mut handle = |line: &str| {
        let line = line.trim();
        if let Some(payload) = line.strip_prefix("data:") {
            let payload = payload.trim();
            if !payload.is_empty() && payload != "[DONE]" {
                on_event(payload);
            }
        }
    };

    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Stream error: {e}"))?
    {
        buf.extend_from_slice(&chunk);
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            handle(&String::from_utf8_lossy(&line_bytes));
        }
    }
    if !buf.is_empty() {
        handle(&String::from_utf8_lossy(&buf));
    }
    Ok(())
}

/// Shared streaming path: POST to `:streamGenerateContent?alt=sse` and forward
/// every text delta to `on_token`.
async fn stream_request(
    cfg: &AiConfig,
    body: GenerateRequest,
    timeout_secs: u64,
    on_token: &Channel<String>,
) -> Result<String, String> {
    let key = api_key()?;
    let url = format!("{API_BASE}/models/{}:streamGenerateContent", cfg.model);

    let mut resp = client(timeout_secs)?
        .post(&url)
        .query(&[("key", key.as_str()), ("alt", "sse")])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Gemini: {e}"))?;

    if !resp.status().is_success() {
        return Err(http_error(resp).await);
    }

    let mut full = String::new();
    let mut refusal: Option<String> = None;
    read_sse_events(&mut resp, |payload| {
        let Ok(event) = serde_json::from_str::<GenerateResponse>(payload) else {
            return;
        };
        let text = candidate_text(&event);
        if !text.is_empty() {
            full.push_str(&text);
            let _ = on_token.send(text);
        } else if refusal.is_none() {
            if let Err(e) = check_refusal(&event, "") {
                refusal = Some(e);
            }
        }
    })
    .await?;

    // Only surface a mid-stream refusal if nothing usable came through.
    if full.trim().is_empty() {
        if let Some(e) = refusal {
            return Err(e);
        }
    }

    Ok(full.trim().to_string())
}

// ── Provider surface ─────────────────────────────────────────────────────────

pub async fn complete(cfg: &AiConfig, prompt: String, timeout_secs: u64) -> Result<String, String> {
    let key = api_key()?;
    let url = format!("{API_BASE}/models/{}:generateContent", cfg.model);
    let body = build_body(None, vec![user_turn(prompt)]);

    let resp = client(timeout_secs)?
        .post(&url)
        .query(&[("key", key.as_str())])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Gemini: {e}"))?;

    if !resp.status().is_success() {
        return Err(http_error(resp).await);
    }

    let parsed: GenerateResponse = resp
        .json()
        .await
        .map_err(|e| format!("Invalid response: {e}"))?;

    let text = candidate_text(&parsed);
    check_refusal(&parsed, &text)?;

    Ok(text.trim().to_string())
}

pub async fn complete_stream(
    cfg: &AiConfig,
    prompt: String,
    timeout_secs: u64,
    on_token: &Channel<String>,
) -> Result<String, String> {
    let body = build_body(None, vec![user_turn(prompt)]);
    stream_request(cfg, body, timeout_secs, on_token).await
}

pub async fn chat_stream(
    cfg: &AiConfig,
    system: String,
    history: Vec<ChatMessage>,
    question: String,
    timeout_secs: u64,
    on_token: &Channel<String>,
) -> Result<String, String> {
    // Gemini calls the assistant side "model" and takes the system prompt out of
    // band, in `systemInstruction`.
    let mut contents: Vec<Content> = history
        .into_iter()
        .map(|m| Content {
            role: if m.role == "assistant" || m.role == "model" {
                "model"
            } else {
                "user"
            },
            parts: vec![Part { text: m.content }],
        })
        .collect();
    contents.push(user_turn(question));

    let body = build_body(Some(system), contents);
    stream_request(cfg, body, timeout_secs, on_token).await
}
