//! macOS-specific hardening.
//!
//! Targets the recurring wake-from-sleep crash: when the window is in native
//! fullscreen and the machine sleeps, on wake tao re-applies the window style
//! mask and clears `NSWindowStyleMaskFullScreen` *outside* a fullscreen
//! transition. AppKit throws `NSGenericException`, and because nothing catches
//! it the process aborts (SIGABRT). Confirmed via the crash logger below.
//!
//! Fix: swizzle `-[NSWindow setStyleMask:]` so the original runs inside an
//! Objective-C exception guard. Normal style changes are untouched; only the
//! throwing wake-time call is swallowed — skipping a bogus style change is far
//! better than crashing, and the window stays fullscreen (which was correct).
//!
//! The uncaught-exception logger is kept as a safety net for anything else.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::ptr::NonNull;
use std::sync::OnceLock;

use objc2::runtime::{AnyObject, Imp, Sel};
use objc2::{class, msg_send, sel};
use objc2_foundation::{NSException, NSSetUncaughtExceptionHandler};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

fn log_line(line: &str) {
    if let Some(path) = LOG_PATH.get() {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{} {}", chrono::Utc::now().to_rfc3339(), line);
        }
    }
}

// ─── Uncaught-exception logger ──────────────────────────────────────────────────

unsafe extern "C-unwind" fn on_uncaught_exception(exception: NonNull<NSException>) {
    let exc = unsafe { exception.as_ref() };
    let name = exc.name().to_string();
    let reason = exc
        .reason()
        .map(|r| r.to_string())
        .unwrap_or_else(|| "<no reason>".to_string());
    log_line(&format!("=== Uncaught NSException ===\nname:   {name}\nreason: {reason}\n"));
}

// ─── setStyleMask: exception guard (swizzle) ────────────────────────────────────

type SetStyleMaskFn = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, usize);
static ORIGINAL_SET_STYLE_MASK: OnceLock<SetStyleMaskFn> = OnceLock::new();

unsafe extern "C-unwind" fn guarded_set_style_mask(this: *mut AnyObject, cmd: Sel, mask: usize) {
    let Some(&original) = ORIGINAL_SET_STYLE_MASK.get() else { return };
    // The args are plain Copy values; nothing is observed after a throw, so
    // asserting unwind-safety across the Obj-C exception boundary is sound.
    let result = objc2::exception::catch(std::panic::AssertUnwindSafe(|| unsafe {
        original(this, cmd, mask)
    }));
    if result.is_err() {
        // AppKit refused the style change (e.g. clearing fullscreen outside a
        // transition on wake). Swallow it rather than let it abort the process.
        log_line("Swallowed NSException in -[NSWindow setStyleMask:] (likely wake-from-sleep fullscreen)");
    }
}

fn swizzle_set_style_mask() {
    let cls = class!(NSWindow);
    let Some(method) = cls.instance_method(sel!(setStyleMask:)) else {
        log_line("swizzle skipped: -[NSWindow setStyleMask:] not found");
        return;
    };
    let new_imp: Imp = unsafe { std::mem::transmute(guarded_set_style_mask as SetStyleMaskFn) };
    let original_imp = unsafe { method.set_implementation(new_imp) };
    let _ = ORIGINAL_SET_STYLE_MASK.set(unsafe { std::mem::transmute::<Imp, SetStyleMaskFn>(original_imp) });
}

// ─── Entry point ────────────────────────────────────────────────────────────────

/// Installs the uncaught-exception logger, the setStyleMask guard, and disables
/// automatic window tabbing. Call once, on the main thread, during app setup.
pub fn install(log_path: PathBuf) {
    let _ = LOG_PATH.set(log_path);
    swizzle_set_style_mask();
    unsafe {
        // objc2 models the C function-pointer typedef as opaque, so the setter
        // takes a raw pointer; hand it our handler cast to one.
        let handler: unsafe extern "C-unwind" fn(NonNull<NSException>) = on_uncaught_exception;
        NSSetUncaughtExceptionHandler(handler as *mut std::ffi::c_void);
        // Stop AppKit from injecting tabbing-related style-mask changes.
        let _: () = msg_send![class!(NSWindow), setAllowsAutomaticWindowTabbing: false];
    }
}
