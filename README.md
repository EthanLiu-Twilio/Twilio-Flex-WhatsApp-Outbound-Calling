# WhatsApp Outbound Calling — Twilio Flex Plugin

A Twilio Flex plugin that enables agents to make outbound **WhatsApp voice calls** directly from the Flex dialpad, in addition to regular PSTN calls.

---

## What It Does

### Agent Experience
When an agent opens the outbound dialpad in Flex, a **Call Mode** selector appears at the top:

- **PSTN Call** — standard outbound phone call (default behaviour, unchanged)
- **WhatsApp Call** — routes the call over WhatsApp

When **WhatsApp Call** mode is selected, two extra buttons appear before dialling:

| Button | What it does |
|---|---|
| **Send Message Template** | Sends an initial WhatsApp message to open a 24-hour conversation window with a new user |
| **Send Consent Template** | Sends a call-consent request — the customer must reply before the agent can proceed with a WhatsApp call |

Once the customer has consented, the agent dials normally. The plugin automatically prefixes the task's `outbound_to` and `from` attributes with `whatsapp:` before the task is accepted, routing the call over WhatsApp.

### Under the Hood

| Component | Description |
|---|---|
| `src/plugin-whatsapp-outbound-calling.js` | Main plugin entry point. Patches `TaskHelper.isVoiceTask` so `whatsapp_call` tasks render the full Flex call canvas (mute, hold, hang-up). Hooks into `beforeAcceptTask` to prefix task attributes with `whatsapp:`. |
| `src/components/WhatsAppDialpadSection.js` | React component injected into the Flex outbound dialpad. Renders the mode toggle and consent/template buttons. Reads the dialled number directly from the DOM. |
| `src/callModeStore.js` | Tiny singleton that shares the selected call mode between the React component and the Flex Actions listener. |
| `twilio-functions/send-message-template.js` | Twilio Serverless Function — sends an initial WhatsApp message template to open the conversation window. Validates the caller's Flex token before acting. |
| `twilio-functions/send-call-template.js` | Twilio Serverless Function — sends a WhatsApp call-consent template. The customer must reply before the agent can call. Validates the Flex token before acting. |

---

## Prerequisites

- A Twilio account with **Flex** enabled
- A **WhatsApp-enabled** Twilio phone number (or WhatsApp Sender)
- Two approved **WhatsApp Message Templates** (one for initial outreach, one for call consent)
- A custom **TaskRouter Task Channel** named `whatsapp_call`
- Node.js ≥ 18 and the [Twilio CLI](https://www.twilio.com/docs/twilio-cli/quickstart) with the Flex plugin installed

---

## Deployment

### Step 1 — Deploy the Twilio Functions service

The two backend functions must be deployed before the plugin is configured.

```bash
cd twilio-functions
cp .env.example .env
```

Edit `.env` with your real values:

```env
WHATSAPP_CALLER_ID=whatsapp:+<your-whatsapp-number>
WHATSAPP_TEMPLATE_SID_SENDCALL=HX<your-call-consent-template-sid>
WHATSAPP_TEMPLATE_SID_SENDSMS=HX<your-initial-message-template-sid>
ACCOUNT_SID=AC<your-account-sid>
AUTH_TOKEN=<your-auth-token>
```

Then install dependencies and deploy:

```bash
npm install
npm run deploy
```

After deployment, note the service URL — it will look like:
```
https://whatsapp-calling-consent-XXXX.twil.io
```

> **Note:** The service is deployed with `twilio-run`. Make sure you are logged in with the Twilio CLI (`twilio login`) before running `npm run deploy`.

---

### Step 2 — Configure the Flex plugin

Go back to the plugin root and copy the example env file:

```bash
cd ..   # back to plugin root
cp .env.example .env
```

Edit `.env` and set the URL from Step 1:

```env
FLEX_APP_WHATSAPP_SERVICE_BASE=https://whatsapp-calling-consent-XXXX.twil.io
```

---

### Step 3 — Install plugin dependencies

```bash
npm install
```

---

### Step 4 — Deploy the Flex plugin

```bash
npm run deploy
```

This builds and uploads the plugin to Twilio Flex via the Flex Plugins API. After a successful deploy, the plugin will appear in the **Flex Plugins** section of the Twilio Console.

Enable it for your Flex configuration in the Console, then release it.

---

## Local Development

```bash
npm start
```

This starts a local dev server at `https://localhost:3000`. Open Flex and append `?localPlugins=plugin-whatsapp-outbound-calling` to the URL to load your local build alongside production plugins.

> The `.env` file must be present with `FLEX_APP_WHATSAPP_SERVICE_BASE` set before starting.

---

## Project Structure

```
plugin-name/
├── src/
│   ├── plugin-whatsapp-outbound-calling.js   # Plugin entry point
│   ├── callModeStore.js                       # Shared mode state singleton
│   └── components/
│       └── WhatsAppDialpadSection.js          # Dialpad UI component
├── twilio-functions/
│   ├── send-message-template.js               # Serverless: send initial WA message
│   ├── send-call-template.js                  # Serverless: send call consent request
│   ├── package.json                           # Function dependencies
│   └── .env.example                           # Required env vars for functions
├── public/
│   └── appConfig.js                           # Flex local dev config
├── .env.example                               # Required env vars for the plugin
└── package.json
```

---

## Environment Variables Reference

### Plugin (`/.env`)

| Variable | Description |
|---|---|
| `FLEX_APP_WHATSAPP_SERVICE_BASE` | Base URL of your deployed Twilio Functions service |

### Twilio Functions (`/twilio-functions/.env`)

| Variable | Description |
|---|---|
| `WHATSAPP_CALLER_ID` | Your WhatsApp-enabled Twilio number, prefixed with `whatsapp:` |
| `WHATSAPP_TEMPLATE_SID_SENDCALL` | SID of the approved WhatsApp call-consent message template |
| `WHATSAPP_TEMPLATE_SID_SENDSMS` | SID of the approved WhatsApp initial outreach message template |
| `ACCOUNT_SID` | Your Twilio Account SID |
| `AUTH_TOKEN` | Your Twilio Auth Token (used for Flex token validation) |

---

## Call Flow

```
Agent opens Flex dialpad
        ↓
Selects "WhatsApp Call" mode
        ↓
(New user?) Clicks "Send Message Template"
  → Opens 24-hr WhatsApp window with customer
        ↓
Clicks "Send Consent Template"
  → Customer receives a WhatsApp consent request and must reply
        ↓
Agent dials number in Flex
  → TaskRouter creates an outbound task
        ↓
beforeAcceptTask fires
  → Plugin patches task attributes:
      outbound_to: "whatsapp:+<number>"
      from:        "whatsapp:+<caller-id>"
        ↓
Agent accepts task
  → Flex renders full voice call canvas
     (via isVoiceTask patch for whatsapp_call channel)
```

---

## License

MIT

