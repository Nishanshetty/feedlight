use std::fs;
use std::path::Path;

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                ' '
            } else {
                c
            }
        })
        .collect();
    let trimmed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated: String = trimmed.chars().take(120).collect();
    if truncated.is_empty() {
        "Untitled".to_string()
    } else {
        truncated
    }
}

/// Writes a markdown file into the given folder (e.g. an Obsidian vault).
/// Returns the full path of the written file.
#[tauri::command]
pub async fn export_markdown(dir: String, filename: String, content: String) -> Result<String, String> {
    let dir_path = Path::new(&dir);
    if !dir_path.is_dir() {
        return Err(format!("Folder does not exist: {dir}"));
    }
    let path = dir_path.join(format!("{}.md", sanitize_filename(&filename)));
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {e}"))?;
    Ok(path.display().to_string())
}
