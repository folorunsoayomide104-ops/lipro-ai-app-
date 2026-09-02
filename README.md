# LIPRO

A private Grok studio: chat, Imagine, and voice. Threads stay in the browser.

## Two different things

| | Grok Build (`grok.me`) | Your own host (this repo) |
|---|---|---|
| Site stays online | While the app is published | While your Vercel (or other) project is live |
| SuperGrok weekly pool empty | Site still opens. New chat / Imagine / Listen pause | Site still opens |
| Who pays for Grok | Your Grok plan / injected key | Your [xAI API](https://console.x.ai) key |

Self-hosting **does not** make Grok free. It moves the **website** off Grok’s servers. Chat still needs an `XAI_API_KEY`. That key is billed on the xAI API — it is **not** the same bucket as SuperGrok weekly Chat.

No key → the studio UI still works; new AI replies fail.

## Put this on GitHub

1. Create a new empty repository on GitHub (no README).
2. Unzip this project and upload the folder, or from a terminal:

```bash
git init
git add .
git commit -m "LIPRO studio"
git remote add origin https://github.com/YOUR_USER/lipro.git
git branch -M main
git push -u origin main
```

## Host on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import the GitHub repo.
2. Framework: leave as Other. Build command is already `npm run build`.
3. Settings → Environment Variables → add `XAI_API_KEY` with your key from [console.x.ai](https://console.x.ai).
4. Deploy.

Your live URL is then yours (Vercel subdomain, or a domain you own).

## Local run (optional)

```bash
cp .env.example .env
# paste XAI_API_KEY into .env
npm install
npm run dev
```

Needs Node 22.
