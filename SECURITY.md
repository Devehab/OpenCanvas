# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub's "Report a vulnerability" button on the repository's Security tab (private vulnerability reporting). Include the affected version or commit, steps to reproduce and the impact you expect.

We aim to acknowledge reports within 3 working days and to ship a fix or mitigation as quickly as the severity requires. We credit reporters who wish to be named.

## Supported versions

Until 1.0, security fixes land on the `main` branch and the latest release.

## Scope and existing protections

OpenCanvas processes untrusted files (designs, packages, images, SVGs, clipboard data). Current protections:

- every document and package is validated against strict schemas and limits, and structurally repaired before use;
- `.opencanvas` packages are size-checked before inflating, path-whitelisted and hash-verified;
- uploads are identified by their bytes, size- and pixel-limited before decoding;
- SVG uploads are sanitized (no scripts, event handlers, `foreignObject` or external references) and only drawn as images;
- pasted text enters the document as plain text;
- uploaded fonts are checked by signature and loaded by the browser before they are stored; plugin packages are size-, path- and type-checked and their manifest validated before installation;
- plugins run in `sandbox="allow-scripts"` frames (opaque origin: no access to the app's pages or storage) under their own CSP with no network access unless approved; every plugin API call is checked against the permissions the person approved, and changes go through the validated command layer;
- PDFs are rendered with pdf.js with XFA and scripts disabled;
- the web app sends a nonce-based Content Security Policy and other security headers, and the container runs as a non-root user on a read-only filesystem.

Bypasses of any of these are in scope, as are XSS, CSP bypasses, denial of service through crafted files, and data exposure between designs or tabs.
