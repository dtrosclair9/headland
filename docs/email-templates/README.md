# Branded email templates

## Supabase auth emails (farmer-facing)
Paste in Supabase Dashboard → Authentication → Emails (templates):

| Template            | File                  | Subject line to set                  |
|---------------------|-----------------------|--------------------------------------|
| Confirm signup      | confirm-signup.html   | Confirm your email — Headland        |
| Reset password      | reset-password.html   | Reset your Headland password         |

CRITICAL: keep the token_hash link format (`/auth/callback?token_hash={{ .TokenHash }}&type=...`).
Supabase's default `{{ .ConfirmationURL }}` breaks our callback ("missing token").

## Webmail signature (info@headlandmaps.com)
privateemail.com → Settings → Mail → Edit signatures → paste signature.html
source (enable HTML mode), set as default for new mail + replies.
Update the name line if someone other than Dayne staffs the inbox.

Assets used: /images/email/logo-white.png and /images/email/logo-mark.png
(committed in public/ — must stay deployed for images to render).
