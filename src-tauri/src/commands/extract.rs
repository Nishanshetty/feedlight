use dom_query::Document;
use scraper::{Html, Selector};
use serde::Serialize;

#[derive(Serialize)]
pub struct ArticleResult {
    pub title: String,
    pub content: String,
    pub byline: Option<String>,
    pub site_name: Option<String>,
}

/// Returns the `content` attribute of the first <meta> matching property or name.
fn meta_content(doc: &Html, value: &str) -> Option<String> {
    for attr in &["property", "name"] {
        let sel_str = format!("meta[{attr}='{value}']");
        let sel = match Selector::parse(&sel_str) {
            Ok(s) => s,
            Err(_) => continue,
        };
        if let Some(el) = doc.select(&sel).next() {
            if let Some(content) = el.value().attr("content") {
                let s = content.trim().to_string();
                if !s.is_empty() {
                    return Some(s);
                }
            }
        }
    }
    None
}

/// Returns the trimmed text content of the first element matching the selector.
fn first_text(doc: &Html, selector: &str) -> Option<String> {
    let sel = Selector::parse(selector).ok()?;
    let text = doc.select(&sel).next()?.text().collect::<String>();
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
}

/// Uses dom_query to strip noise elements then extract the main readable content.
fn extract_main_content(html: &str) -> String {
    let doc = Document::from(html);

    // Remove everything that isn't article text
    doc.select(
        "script, style, noscript, iframe, \
         nav, header, footer, aside, form, \
         [role='navigation'], [role='banner'], [role='complementary'], \
         .nav, .navigation, .menu, .sidebar, .widget, \
         .advertisement, .ads, .ad, .promo, \
         .related, .related-posts, .recommended, \
         .comments, .comment-section, #comments, \
         .social, .share, .sharing, \
         .newsletter, .subscribe, .signup, \
         figure > figcaption"
    ).remove();

    // Try content candidates in priority order
    let candidates = [
        "article",
        "[itemprop='articleBody']",
        ".post-content",
        ".article-body",
        ".article-content",
        ".entry-content",
        ".story-body",
        ".content-body",
        "main",
        "[role='main']",
        "#content",
        ".content",
        "body",
    ];

    for candidate in candidates {
        let sel = doc.select(candidate);
        if !sel.is_empty() {
            let content = sel.first().inner_html().to_string();
            if content.len() >= 200 {
                return content;
            }
        }
    }

    String::new()
}

#[tauri::command]
pub async fn extract_article(url: String) -> Result<ArticleResult, String> {
    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
             AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/124.0.0.0 Safari/537.36",
        )
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch article: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Article server returned HTTP {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read article body: {e}"))?;

    // Use scraper for meta extraction (lightweight, read-only)
    let scraper_doc = Html::parse_document(&html);
    let title = meta_content(&scraper_doc, "og:title")
        .or_else(|| first_text(&scraper_doc, "title"))
        .or_else(|| first_text(&scraper_doc, "h1"))
        .unwrap_or_default();
    let byline = meta_content(&scraper_doc, "author")
        .or_else(|| meta_content(&scraper_doc, "article:author"));
    let site_name = meta_content(&scraper_doc, "og:site_name");

    // Use dom_query for content extraction (supports DOM mutation / noise removal)
    let content = extract_main_content(&html);

    Ok(ArticleResult { title, content, byline, site_name })
}
