/// Extracts plain text from a local PDF file so it can be read in the article
/// pane. Runs on a blocking thread to keep the UI responsive on large files.
#[tauri::command]
pub async fn extract_pdf_text(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        pdf_extract::extract_text(&path).map_err(|e| format!("Could not read PDF: {e}"))
    })
    .await
    .map_err(|e| format!("Extraction task failed: {e}"))?
}
