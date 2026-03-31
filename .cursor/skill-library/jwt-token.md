# Skill: JWT Bearer Token — Encode & Decode

## Purpose
Generate (encode) or inspect (decode) HS256 JWT bearer tokens that match the
unify-enterprise token format, using only in-memory evaluation.
**Nothing is written to disk. The secret key is never typed in chat.**

---

## Security rules (ALWAYS enforce, no exceptions)

1. **Secret key** — NEVER ask the user to type it in chat. ALWAYS read it from
   the `JWT_SECRET_KEY` environment variable (Cursor Dashboard → Secrets).
   If the variable is absent or empty, stop and tell the user to add it.

2. **Token value in chat** — A valid JWT is a credential. Treat it like a
   password. Display it once so the user can copy it, then do not repeat it.

3. **PII** — `subscriber_email` is personal data. Do not log it to any file.

4. **No disk writes** — Run all encode/decode logic as a short in-memory
   `python3 -c "..."` or shell heredoc. Do not write `.py` files or scripts.

5. **Do not store inputs** — After the agent responds, no intermediate file
   should contain the secret, the token, or the email.

---

## Required input parameters

### Encode (generate a new token)

| Parameter | Type | Where it comes from |
|-----------|------|---------------------|
| `subscriber_id` | integer | User provides in chat |
| `subscriber_email` | string | User provides in chat |
| `expiration_minutes` | integer (default 60) | User provides, or use default |
| `secret_key` | string | **Read from `$JWT_SECRET_KEY` env var only** |

### Decode (inspect an existing token)

| Parameter | Type | Where it comes from |
|-----------|------|---------------------|
| `token` | string | User pastes in chat |
| `verify_signature` | bool (default false) | Optional — only if user also wants sig check |
| `secret_key` | string | Only needed when `verify_signature=true` — read from `$JWT_SECRET_KEY` |

---

## Encode — exact shell command to run

Replace `{{subscriber_id}}`, `{{subscriber_email}}`, `{{expiration_minutes}}`
with the values the user provided. Read the secret from the env var inside the
Python expression — never interpolate it from the shell.

```bash
python3 - << 'PEOF'
import base64, json, hmac, hashlib, os, time

secret  = os.environ.get("JWT_SECRET_KEY", "")
if not secret or len(secret) < 32:
    raise SystemExit("JWT_SECRET_KEY env var is missing or shorter than 32 characters. "
                     "Add it in Cursor Dashboard → Cloud Agents → Secrets.")

sub_id    = {{subscriber_id}}
sub_email = "{{subscriber_email}}"
exp_mins  = {{expiration_minutes}}

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

header  = b64url(b'{"typ":"JWT","alg":"HS256"}')
payload = b64url(json.dumps({
    "subscriber_id":    sub_id,
    "subscriber_email": sub_email,
    "exp":              int(time.time()) + exp_mins * 60,
}, separators=(",", ":")).encode())

signing_input = f"{header}.{payload}"
sig = b64url(hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest())

print(f"{signing_input}.{sig}")
PEOF
```

**After running:** display only the token line. Do not echo the secret.

---

## Decode — exact shell command to run

```bash
python3 - << 'PEOF'
import base64, json

token = "{{token}}"
parts = token.split(".")
if len(parts) != 3:
    raise SystemExit("Not a valid JWT — expected 3 dot-separated parts.")

def b64d(s):
    s += "=" * (-len(s) % 4)
    return json.loads(base64.urlsafe_b64decode(s))

header  = b64d(parts[0])
payload = b64d(parts[1])

print("=== Header ===")
print(json.dumps(header,  indent=2))
print()
print("=== Payload ===")
print(json.dumps(payload, indent=2))

import time
exp = payload.get("exp")
if exp:
    remaining = exp - int(time.time())
    if remaining > 0:
        print(f"\nToken is VALID — expires in {remaining // 60} min {remaining % 60} sec")
    else:
        print(f"\nToken is EXPIRED — {abs(remaining) // 60} min {abs(remaining) % 60} sec ago")
PEOF
```

**Note:** Decode does NOT verify the signature (base64 is public). To verify,
pass `verify_signature=true` — the agent will also run an HMAC check using
`$JWT_SECRET_KEY`.

---

## Output format

### Encode response
```
✅ JWT Bearer Token generated

Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.<payload>.<sig>

Expires : <human-readable UTC datetime>  (~<N> minutes from now)
Claims  : subscriber_id=<id>, subscriber_email=<email>
```

### Decode response
```
=== Header ===
{ "typ": "JWT", "alg": "HS256" }

=== Payload ===
{ "subscriber_id": ..., "subscriber_email": "...", "exp": ... }

Token is VALID — expires in X min Y sec
  (or)
Token is EXPIRED — X min Y sec ago
```

---

## Edge cases

| Situation | Action |
|-----------|--------|
| `JWT_SECRET_KEY` missing | Stop. Tell user: *"Add `JWT_SECRET_KEY` (≥ 32 chars) in Cursor Dashboard → Cloud Agents → Secrets."* |
| Secret shorter than 32 chars | Stop. Same message — HS256 requires 256-bit minimum. |
| User tries to type secret in chat | Refuse. Say: *"For security, paste it into Cursor Secrets — never in chat."* |
| Token is expired | Decode succeeds; label it EXPIRED clearly. |
| Malformed token | Report which part is invalid. |
