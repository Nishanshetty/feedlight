use base64::Engine as _;
use piper_rs::Piper;
use serde::Serialize;
use std::io::Write;
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

/// Default local voice. The model + config are downloaded on demand from
/// HuggingFace (rhasspy/piper-voices) into the app data directory.
const VOICE_NAME: &str = "en_US-lessac-medium";
const VOICE_ONNX_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx";
const VOICE_CONFIG_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json";

/// Sentinel error the frontend matches on to prompt the user to download the
/// voice in Settings. Keep this string stable.
const ERR_NOT_DOWNLOADED: &str = "voice_not_downloaded";

fn voice_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?
        .join("tts");
    Ok(dir)
}

/// Returns `(onnx_path, config_path)` for the bundled voice.
fn voice_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let dir = voice_dir(app)?;
    Ok((
        dir.join(format!("{VOICE_NAME}.onnx")),
        dir.join(format!("{VOICE_NAME}.onnx.json")),
    ))
}

/// Whether the local voice has been downloaded and is ready to use.
#[tauri::command]
pub fn tts_voice_status(app: AppHandle) -> Result<bool, String> {
    let (onnx, config) = voice_paths(&app)?;
    Ok(onnx.exists() && config.exists())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    downloaded: u64,
    /// Total bytes, when the server reports a content length.
    total: Option<u64>,
}

async fn download_to(
    client: &reqwest::Client,
    url: &str,
    dest: &PathBuf,
    on_event: Option<&Channel<DownloadProgress>>,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    let mut resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download failed: HTTP {}", resp.status()));
    }
    let total = resp.content_length();

    // Write to a temp `.part` file, then atomically rename into place.
    let part = dest.with_extension("part");
    let mut file = tokio::fs::File::create(&part)
        .await
        .map_err(|e| format!("Cannot create {}: {e}", part.display()))?;

    let mut downloaded = 0u64;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Download interrupted: {e}"))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write failed: {e}"))?;
        downloaded += chunk.len() as u64;
        if let Some(ch) = on_event {
            let _ = ch.send(DownloadProgress { downloaded, total });
        }
    }
    file.flush().await.map_err(|e| format!("Flush failed: {e}"))?;
    drop(file);

    tokio::fs::rename(&part, dest)
        .await
        .map_err(|e| format!("Cannot finalize {}: {e}", dest.display()))?;
    Ok(())
}

/// Downloads the local voice model + config into the app data directory,
/// reporting byte progress over `on_event`.
#[tauri::command]
pub async fn download_tts_voice(
    app: AppHandle,
    on_event: Channel<DownloadProgress>,
) -> Result<(), String> {
    let dir = voice_dir(&app)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Cannot create voice dir: {e}"))?;
    let (onnx, config) = voice_paths(&app)?;

    let client = reqwest::Client::new();
    // Config is tiny; no progress needed. Model is the large download.
    download_to(&client, VOICE_CONFIG_URL, &config, None).await?;
    download_to(&client, VOICE_ONNX_URL, &onnx, Some(&on_event)).await?;
    Ok(())
}

/// Encodes 16-bit mono PCM samples as a complete WAV file.
fn samples_to_wav(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let channels: u16 = 1;
    let bits: u16 = 16;
    let data_len = (samples.len() * 2) as u32;
    let byte_rate = sample_rate * channels as u32 * (bits / 8) as u32;
    let mut buf = Vec::with_capacity(44 + samples.len() * 2);
    buf.write_all(b"RIFF").unwrap();
    buf.write_all(&(36 + data_len).to_le_bytes()).unwrap();
    buf.write_all(b"WAVEfmt ").unwrap();
    buf.write_all(&16u32.to_le_bytes()).unwrap();
    buf.write_all(&1u16.to_le_bytes()).unwrap(); // PCM
    buf.write_all(&channels.to_le_bytes()).unwrap();
    buf.write_all(&sample_rate.to_le_bytes()).unwrap();
    buf.write_all(&byte_rate.to_le_bytes()).unwrap();
    buf.write_all(&(channels * bits / 8).to_le_bytes()).unwrap();
    buf.write_all(&bits.to_le_bytes()).unwrap();
    buf.write_all(b"data").unwrap();
    buf.write_all(&data_len.to_le_bytes()).unwrap();
    for &s in samples {
        let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        buf.write_all(&v.to_le_bytes()).unwrap();
    }
    buf
}

/// Synthesizes text to WAV using the local Piper voice and returns base64 audio.
#[tauri::command]
pub async fn synthesize_speech(text: String, app: AppHandle) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("Text is empty".to_string());
    }

    let (onnx, config) = voice_paths(&app)?;
    if !onnx.exists() || !config.exists() {
        return Err(ERR_NOT_DOWNLOADED.to_string());
    }

    // Piper inference is CPU-bound and blocking; run it off the async runtime.
    let wav = tokio::task::spawn_blocking(move || -> Result<Vec<u8>, String> {
        let mut piper =
            Piper::new(&onnx, &config).map_err(|e| format!("Failed to load voice: {e}"))?;
        let (samples, sample_rate) = piper
            .create(text.trim(), false, None, None, None, None)
            .map_err(|e| format!("Synthesis failed: {e}"))?;
        Ok(samples_to_wav(&samples, sample_rate))
    })
    .await
    .map_err(|e| format!("Synthesis task failed: {e}"))??;

    Ok(base64::engine::general_purpose::STANDARD.encode(&wav))
}
