//! macOS-specific hardening.
//!
//! Two things happen here, both aimed at the recurring wake-from-sleep crash:
//! an uncaught Objective-C exception thrown inside `-[NSWindow setStyleMask:]`
//! that aborts the process before any backtrace records its *reason*.
//!
//! 1. Install an uncaught-exception handler that appends the exception's name
//!    and reason to a log file just before the process dies — so the next crash
//!    tells us exactly what AppKit objected to.
//! 2. Disable automatic window tabbing, a common trigger of spurious
//!    `setStyleMask:` exceptions during window restoration.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::ptr::NonNull;
use std::sync::OnceLock;

use objc2::{class, msg_send};
use objc2_foundation::{NSException, NSSetUncaughtExceptionHandler};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

unsafe extern "C-unwind" fn on_uncaught_exception(exception: NonNull<NSException>) {
    let exc = unsafe { exception.as_ref() };
    let name = exc.name().to_string();
    let reason = exc
        .reason()
        .map(|r| r.to_string())
        .unwrap_or_else(|| "<no reason>".to_string());

    if let Some(path) = LOG_PATH.get() {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(
                f,
                "=== Uncaught NSException @ {} ===\nname:   {name}\nreason: {reason}\n",
                chrono::Utc::now().to_rfc3339(),
            );
        }
    }
}

/// Installs the uncaught-exception logger and applies window hardening.
/// Call once, on the main thread, during app setup.
pub fn install(log_path: PathBuf) {
    let _ = LOG_PATH.set(log_path);
    unsafe {
        // objc2 models the C function-pointer typedef as opaque, so the setter
        // takes a raw pointer; hand it our handler cast to one.
        let handler: unsafe extern "C-unwind" fn(NonNull<NSException>) = on_uncaught_exception;
        NSSetUncaughtExceptionHandler(handler as *mut std::ffi::c_void);
        // Stop AppKit from injecting tabbing-related style-mask changes.
        let _: () = msg_send![class!(NSWindow), setAllowsAutomaticWindowTabbing: false];
    }
}
