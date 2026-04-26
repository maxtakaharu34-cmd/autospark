# AutoSpark

AutoSpark is a small Next.js app that generates Japanese X post drafts with Anthropic.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `ANTHROPIC_API_KEY`.
4. Set `ALLOWED_ORIGINS` to the browser origins allowed to call `/api/generate`.
5. Optionally tune `GENERATE_RATE_LIMIT_MAX` and `GENERATE_RATE_LIMIT_WINDOW_MS`.
6. Start the app with `npm run dev`.

## Security

- `/api/generate` only accepts requests from the current app origin or entries listed in `ALLOWED_ORIGINS`.
- Requests are rate-limited per IP address in memory.
- Both request payloads and AI responses are validated before being returned to the client.

## Deploy

Deploy on Vercel or any Node-compatible hosting environment.
