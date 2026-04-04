# Marcus Slack Bot - Setup Guide

This guide walks through creating the Slack app, configuring it, and connecting it to Kinetiks so Marcus can communicate via Slack.

---

## 1. Create a Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App"
3. Choose "From scratch"
4. Name: **Marcus** (or "Kinetiks Marcus")
5. Select your workspace
6. Click "Create App"

---

## 2. Configure Bot Token Scopes

Navigate to **OAuth & Permissions** in the sidebar.

Under "Bot Token Scopes", add these scopes:

| Scope | Why |
|-------|-----|
| `chat:write` | Send messages as Marcus |
| `im:history` | Read DM conversation history |
| `im:read` | View DMs with Marcus |
| `im:write` | Open DMs with users |
| `app_mentions:read` | Respond when @mentioned in channels |
| `channels:history` | Read messages in channels Marcus is added to |
| `groups:history` | Read messages in private channels Marcus is added to |
| `reactions:write` | React to messages (acknowledgment) |

---

## 3. Enable Event Subscriptions

Navigate to **Event Subscriptions** in the sidebar.

1. Toggle "Enable Events" to **On**
2. Set the Request URL to: `https://id.kinetiks.ai/api/marcus/slack/events`
   - Slack will send a verification challenge - the endpoint must respond with the challenge value
   - If this fails, the endpoint may not be deployed yet - deploy first, then configure
3. Under "Subscribe to bot events", add:
   - `message.im` - DMs to Marcus
   - `app_mention` - @Marcus mentions in channels

Click "Save Changes".

---

## 4. Enable Interactivity

Navigate to **Interactivity & Shortcuts** in the sidebar.

1. Toggle "Interactivity" to **On**
2. Set the Request URL to: `https://id.kinetiks.ai/api/marcus/slack/interact`
   - This handles button clicks (Approve/Dismiss on escalated Proposals)

Click "Save Changes".

---

## 5. Configure OAuth

Navigate to **OAuth & Permissions**.

1. Under "Redirect URLs", add: `https://id.kinetiks.ai/api/marcus/slack/oauth`
2. Click "Save URLs"

---

## 6. Install to Workspace

1. Go to **Install App** in the sidebar
2. Click "Install to Workspace"
3. Authorize the permissions
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

---

## 7. Get Your Credentials

You need 5 values for your `.env.local`:

| Variable | Where to Find |
|----------|---------------|
| `SLACK_BOT_TOKEN` | OAuth & Permissions -> Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Basic Information -> App Credentials -> Signing Secret |
| `SLACK_APP_TOKEN` | Basic Information -> App-Level Tokens -> Generate Token with `connections:write` scope (for Socket Mode dev) |
| `SLACK_CLIENT_ID` | Basic Information -> App Credentials -> Client ID |
| `SLACK_CLIENT_SECRET` | Basic Information -> App Credentials -> Client Secret |

Add them to your `.env.local`:

```
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_CLIENT_ID=your-client-id
SLACK_CLIENT_SECRET=your-client-secret
```

---

## 8. Connect in Kinetiks

Once the Slack integration code is deployed:

1. Go to **id.kinetiks.ai/connections**
2. Click "Connect Slack"
3. Authorize the Kinetiks app in your workspace
4. Go to **id.kinetiks.ai/marcus/schedules** to configure brief delivery

---

## 9. Test the Connection

1. Open Slack and find the Marcus bot in your DMs
2. Send a message: "What's my confidence score?"
3. Marcus should respond within a few seconds
4. Check the web UI at id.kinetiks.ai/marcus - the conversation should appear there too

---

## Troubleshooting

**Marcus doesn't respond in Slack:**
- Check that the Events URL is correct and verified
- Check Slack app logs at api.slack.com/apps -> your app -> Event Subscriptions
- Verify `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` are correct in .env.local
- Check Vercel function logs for errors

**Buttons don't work (Approve/Dismiss):**
- Check that Interactivity URL is correct
- Verify the interact route is deployed

**Thread sync issues:**
- Threads sync via `slack_thread_ts` - verify this column is populated
- Check that the account mapping (Slack team_id to Kinetiks account) is correct in kinetiks_connections

---

## Architecture Notes

- Slack Bolt is NOT used in production (Vercel is serverless). Instead, raw webhook handling with `@slack/web-api` for sending.
- Slack events require a 200 response within 3 seconds. Marcus processes the message asynchronously after acknowledging.
- One Slack workspace maps to one Kinetiks account via `kinetiks_connections` (provider = 'slack').
- All conversations in Slack are stored in `kinetiks_marcus_threads` and `kinetiks_marcus_messages` with channel = 'slack'.
