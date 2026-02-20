# Privacy Policy — Password Policy Helper

**Last updated:** February 2025

## Summary

Password Policy Helper does not collect, store, or transmit any user data. Everything happens locally in your browser.

## Data Collection

This extension collects **no data whatsoever**. Specifically:

- No personally identifiable information
- No authentication information (passwords are processed in memory and never stored or sent anywhere)
- No health, financial, or payment information
- No browsing history, location, or user activity
- No website content
- No analytics or telemetry
- No cookies or tracking

## How the Extension Works

- **Password processing** — When you fix, generate, or validate a password, all computation happens locally in your browser's JavaScript engine. Passwords exist only in the popup's in-memory variables and are discarded when the popup closes.
- **Content script** — The content script runs only on `worldline-pciportal.com` to detect password input fields. It reads or writes a password field's value only when you explicitly click "Read from page" or "Fill on Page" in the popup. No data is persisted or sent anywhere.
- **Clipboard** — The "Copy" button uses the browser's clipboard API to copy a password to your clipboard. This is a one-way, user-initiated action. The extension never reads your clipboard.

## Permissions

| Permission | Why it's needed |
|---|---|
| `activeTab` | Communicate with the content script to read/write password fields when you click the extension icon |
| `clipboardWrite` | Copy fixed or generated passwords to the clipboard when you click the Copy button |
| Host: `worldline-pciportal.com` | Run the content script that detects password fields on this specific site |

## Network Requests

This extension makes **zero network requests**. There are no external scripts, no CDN resources, no APIs, no analytics endpoints, and no remote code of any kind. You can verify this by inspecting the source code or monitoring network activity while the extension is active.

## Third Parties

No data is shared with or sold to any third party. There are no third-party libraries, SDKs, or services embedded in this extension.

## Open Source

The full source code is available at [https://github.com/kfrancis/worldline-password-policy-helper](https://github.com/kfrancis/worldline-password-policy-helper) under the MIT license. You can audit every line.

## Contact

If you have questions about this privacy policy, open an issue on the [GitHub repository](https://github.com/kfrancis/worldline-password-policy-helper/issues).
