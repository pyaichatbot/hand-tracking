# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest (`main`) | ✅ |

## Reporting a Vulnerability

Please **do not** file a public GitHub issue for security vulnerabilities.

Instead, report them privately by emailing the maintainer or opening a [GitHub private security advisory](https://github.com/pyaichatbot/hand-tracking/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

**Praveen Yellamaraju** will acknowledge receipt within 72 hours and aim to release a fix within 14 days for confirmed issues.

## Security Notes

- This app runs entirely in the browser — no user data is sent to any server
- The webcam feed is processed locally via MediaPipe WASM and is never uploaded
- No authentication, cookies, or persistent storage are used
