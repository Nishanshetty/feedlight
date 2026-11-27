# Releasing

For maintainers. Contributors don't need any of this: PR builds are never signed.

Pushing a `vX.Y.Z` tag builds the DMG, signs it with the Developer ID
certificate, notarizes it with Apple, and publishes a GitHub Release
([`.github/workflows/release.yml`](../.github/workflows/release.yml)). PR and
`main` builds are not signed.

## Test releases

Tags with a hyphen (`v0.2.2-rc.1`) create a **draft** release instead. Only
maintainers can see it, and it never becomes "Latest", which the website's
download button links to. Use them to test a build before a real release.

## Signing secrets

Signing uses these repository secrets:

| Secret | What it holds |
|--------|---------------|
| `APPLE_CERTIFICATE` | The Developer ID Application certificate and private key, as a base64-encoded `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | The `.p12` password |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Name (TEAMID)` |
| `APPLE_API_KEY` | App Store Connect API key ID (notarization) |
| `APPLE_API_ISSUER` | App Store Connect issuer ID |
| `APPLE_API_KEY_P8` | The API key's `.p8` file contents |
| `TAURI_SIGNING_PRIVATE_KEY` | The updater private key (`~/.tauri/feedlight.key`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | That key's password |

## Renewing

The Developer ID certificate expires after 5 years. To replace it, create a
new one at developer.apple.com and update `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY`. An API key can be
revoked and replaced in App Store Connect at any time.

## In-app updates

Tag builds also produce a signed update (`Feedlight_<version>.app.tar.gz` plus
its `.sig`; `tauri-action@v1` puts the version in the file name) and a
`latest.json` that lists it. Installed copies of Feedlight fetch `latest.json`
from the newest **published** release at most once a day
(`plugins.updater.endpoints` in `src-tauri/tauri.conf.json`), so drafts and
`-rc` tags never reach users. Before installing, the app checks the update's
signature against the public key in `plugins.updater.pubkey`.

Updater artifacts need the private key, so they are only switched on for tag
builds (`src-tauri/tauri.release.conf.json`). Local and PR builds don't need it.

> ⚠️ **The updater key cannot be replaced.** Every installed copy trusts only
> the public key it shipped with. If `TAURI_SIGNING_PRIVATE_KEY` or its
> password is lost, no installed copy can be updated again; users would have
> to download and reinstall by hand. Keep the key file and password backed up
> somewhere other than this repository.

Users can turn off automatic checks in Settings → Updates. "Check now" in the
same section always works.
