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

## Renewing

The Developer ID certificate expires after 5 years. To replace it, create a
new one at developer.apple.com and update `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY`. An API key can be
revoked and replaced in App Store Connect at any time.
