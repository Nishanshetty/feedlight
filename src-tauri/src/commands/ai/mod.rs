//! AI features, split into *what to ask* (this file) and *who to ask*
//! (`provider` + one module per backend). Prompts live here and here only, so
//! adding a provider means implementing the three functions in `provider.rs` —
//! not restating six prompts.

mod gemini;
mod ollama;
mod provider;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

pub use provider::{AiConfig, ChatMessage};

#[derive(Deserialize)]
pub struct DigestArticle {
    pub title: String,
    pub content: String,
    pub feed_title: String,
}

#[derive(Serialize)]
pub struct DigestResult {
    pub overall_summary: String,
    pub article_count: usize,
}

/// Lists the models installed on an Ollama instance. Powers the Settings "Test"
/// button; `base_url` comes straight from the field the user is editing.
#[tauri::command]
pub async fn check_ollama(base_url: String) -> Result<Vec<String>, String> {
    ollama::list_models(&base_url).await
}

/// Verifies the saved key and the chosen model with a minimal generation.
///
/// Deliberately a real `generateContent` call rather than a model listing: it
/// proves key, model and API-enablement in one shot, and when the Gemini API is
/// disabled on the key's project this endpoint names the project and links the
/// activation page — where `ListModels` only says "requests are blocked".
#[tauri::command]
pub async fn check_gemini(config: AiConfig) -> Result<(), String> {
    provider::complete(&config, "Reply with the single word: OK".to_string(), 30).await?;
    Ok(())
}

#[tauri::command]
pub async fn summarize_article(
    config: AiConfig,
    text: String,
    on_token: Channel<String>,
) -> Result<String, String> {
    // Truncate to keep prompt manageable for smaller models
    let truncated: String = text.chars().take(4000).collect();

    let prompt = format!(
        "Summarize the following article in 3-5 sentences. Be concise and factual. \
Do not begin with \"This article\" or \"The article\". Just give the summary.\n\n---\n{truncated}"
    );

    provider::complete_stream(&config, prompt, 120, &on_token).await
}

#[tauri::command]
pub async fn chat_article(
    config: AiConfig,
    article_text: String,
    history: Vec<ChatMessage>,
    question: String,
    on_token: Channel<String>,
) -> Result<String, String> {
    let truncated: String = article_text.chars().take(6000).collect();

    let system = format!(
        "You are a helpful assistant. Answer questions about the following article. \
Be concise and accurate. If the answer isn't in the article, say so.\n\n---\n{truncated}"
    );

    provider::chat_stream(&config, system, history, question, 120, &on_token).await
}

#[tauri::command]
pub async fn suggest_questions(
    config: AiConfig,
    article_text: String,
    history: Vec<ChatMessage>,
) -> Result<Vec<String>, String> {
    let truncated: String = article_text.chars().take(3000).collect();

    let context = if history.is_empty() {
        format!("Article:\n{truncated}")
    } else {
        let convo: String = history
            .iter()
            .map(|m| format!("{}: {}", m.role, m.content))
            .collect::<Vec<_>>()
            .join("\n");
        format!("Article:\n{truncated}\n\nConversation so far:\n{convo}")
    };

    let prompt = format!(
        "{context}\n\n\
Suggest exactly 3 short, distinct questions a reader might want to ask next. \
Return ONLY a JSON array of 3 strings, no explanation, no markdown. \
Example: [\"What caused X?\", \"How does Y work?\", \"What is the impact of Z?\"]"
    );

    let raw = provider::complete(&config, prompt, 60).await?;
    let questions = provider::parse_json_array(&raw, "suggestions")?;

    Ok(questions.into_iter().take(3).collect())
}

#[tauri::command]
pub async fn key_takeaways(config: AiConfig, text: String) -> Result<Vec<String>, String> {
    let truncated: String = text.chars().take(4000).collect();

    let prompt = format!(
        "Article:\n{truncated}\n\n\
Extract exactly 3 key takeaways from this article. Each must be one crisp, factual sentence. \
Return ONLY a JSON array of 3 strings, no explanation, no markdown. \
Example: [\"First takeaway.\", \"Second takeaway.\", \"Third takeaway.\"]"
    );

    let raw = provider::complete(&config, prompt, 120).await?;
    let takeaways = provider::parse_json_array(&raw, "takeaways")?;

    Ok(takeaways
        .into_iter()
        .filter(|t| !t.trim().is_empty())
        .take(3)
        .collect())
}

#[tauri::command]
pub async fn generate_digest(
    config: AiConfig,
    articles: Vec<DigestArticle>,
) -> Result<DigestResult, String> {
    let article_count = articles.len();
    if article_count == 0 {
        return Ok(DigestResult {
            overall_summary: String::new(),
            article_count: 0,
        });
    }

    // Group articles by feed and build a compact prompt (300 chars per article)
    let mut by_feed: std::collections::BTreeMap<&str, Vec<&DigestArticle>> =
        std::collections::BTreeMap::new();
    for a in articles.iter().take(40) {
        by_feed.entry(a.feed_title.as_str()).or_default().push(a);
    }

    let mut sections = String::new();
    for (feed, items) in &by_feed {
        sections.push_str(&format!("\n== {feed} ==\n"));
        for (i, a) in items.iter().enumerate() {
            let snippet: String = a.content.chars().take(300).collect();
            sections.push_str(&format!("{}. \"{}\"\n{snippet}\n\n", i + 1, a.title));
        }
    }

    let prompt = format!(
        "The following are news articles published in the last 24 hours, grouped by source.\n\
Write exactly 4-6 key highlights covering the main themes and notable stories. \
Each highlight must be one crisp sentence. \
Output ONLY a plain list — one highlight per line, each line starting with \"- \". \
No intro, no outro, no blank lines between items, no markdown other than the leading dash.\n\
{sections}"
    );

    let overall_summary = provider::complete(&config, prompt, 180).await?;

    Ok(DigestResult {
        overall_summary,
        article_count,
    })
}

#[tauri::command]
pub async fn generate_discover_queries(
    config: AiConfig,
    feed_titles: Vec<String>,
) -> Result<Vec<String>, String> {
    if feed_titles.is_empty() {
        return Ok(vec![]);
    }

    let titles = feed_titles
        .iter()
        .take(20)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    let prompt = format!(
        "Based on these RSS feed subscriptions: {titles}\n\
         Generate exactly 4 web search queries to discover new relevant articles the user would enjoy.\n\
         Return ONLY a valid JSON array of strings, nothing else.\n\
         Example: [\"query 1\", \"query 2\", \"query 3\", \"query 4\"]"
    );

    let raw = provider::complete(&config, prompt, 60).await?;
    let queries = provider::parse_json_array(&raw, "queries")?;

    Ok(queries
        .into_iter()
        .filter(|q| !q.trim().is_empty())
        .take(5)
        .collect())
}
