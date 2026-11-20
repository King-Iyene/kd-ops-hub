// Ops Agent connections: the tools you can connect and how to set each one up.
//
// A connection only SENDS data to a tool (messages, items, summaries). Each preset says which `kind` the backend uses, what
// the person has to copy out of that tool, and the steps to get it. Presets for tools that are reached through their API
// (Airtable, Trello, Notion ...) fill in the generic "api" connection: address, method, how the token is sent and the body
// the tool expects, with {{variables}} the agent fills in for every message.
//
// Body variables: {{title}} {{text}} {{event}} (flag | summary | message | test) {{severity}} {{rule}} {{person}} {{sent_at}}.
// Values are escaped for the content type (JSON string, form encoding or plain text).

export type ConnectionKind = 'slack' | 'cliq' | 'discord' | 'teams' | 'gchat' | 'telegram' | 'email' | 'webhook' | 'n8n' | 'api';
export type AuthType = 'none' | 'bearer' | 'header' | 'basic' | 'query';
export type ContentType = 'json' | 'form' | 'text';

/** What the agent can push on its own, per connection. */
export const AUTO_EVENTS = [
  { key: 'flag_high', label: 'New high-priority items', help: 'The moment a high or critical item is raised.' },
  { key: 'flag_all', label: 'Every new item', help: 'All new Inbox items. Can be a lot on a busy day.' },
  { key: 'summary_day', label: 'Daily summary', help: 'At 6:30 PM Eastern on working days.' },
  { key: 'summary_week', label: 'Weekly summary', help: 'On the last working day of the week.' },
  { key: 'summary_month', label: 'Monthly summary', help: 'On the last working day of the month.' },
] as const;
export type AutoEvent = (typeof AUTO_EVENTS)[number]['key'];
export const DEFAULT_EVENTS: AutoEvent[] = ['flag_high', 'summary_day'];

/** Zoho keeps each customer's data in one region. The Cliq API address and the sign-in address both depend on it. */
export const CLIQ_DATA_CENTERS = [
  { value: 'com', label: 'United States (.com)' },
  { value: 'eu', label: 'Europe (.eu)' },
  { value: 'in', label: 'India (.in)' },
  { value: 'com.au', label: 'Australia (.com.au)' },
  { value: 'jp', label: 'Japan (.jp)' },
  { value: 'ca', label: 'Canada (.ca)' },
  { value: 'sa', label: 'Saudi Arabia (.sa)' },
  { value: 'com.cn', label: 'China (.com.cn)' },
] as const;
export type CliqDataCenter = (typeof CLIQ_DATA_CENTERS)[number]['value'];
export const DEFAULT_CLIQ_DC: CliqDataCenter = 'com';
/** Cliq channel unique names: lowercase letters, digits and underscores. */
export const CLIQ_CHANNEL_PATTERN = /^[a-z0-9_]{1,50}$/;

/** Cliq API fields that are only for the older ways to connect. They sit under "Other ways to connect (advanced)". */
export const CLIQ_ADVANCED_FIELDS: readonly string[] = ['grant_code', 'refresh_token'];

export interface PresetField {
  /** The field the save call takes. */
  field: 'url' | 'token' | 'to' | 'chat_id' | 'method' | 'header_name' | 'query_param' | 'body_template'
    | 'dc' | 'client_id' | 'client_secret' | 'grant_code' | 'refresh_token' | 'channel';
  label: string;
  hint?: string;
  placeholder?: string;
  secret?: boolean;
  required?: boolean;
  /** A fixed list of choices, shown as a drop-down. */
  options?: readonly { value: string; label: string }[];
}

export interface ConnectionPreset {
  id: string;
  name: string;
  /** Short line under the name in the picker. */
  tagline: string;
  kind: ConnectionKind;
  /** Tools that can be reached in two ways (Cliq) have one preset per way. `api` posts through the tool's REST API after a Zoho sign-in. */
  mode?: 'webhook' | 'api';
  /** Which brand logo to draw when it is not the preset's own id. */
  brand?: string;
  /** lucide icon name, used by the picker */
  icon: 'MessageSquare' | 'Mail' | 'Send' | 'Webhook' | 'Table2' | 'KanbanSquare' | 'FileText' | 'Plug' | 'Workflow' | 'Phone';
  /** Numbered steps shown before the fields. Plain language, in the tool's own words. */
  steps: string[];
  fields: PresetField[];
  /** Defaults for the generic API connection. */
  api?: { method: 'POST' | 'PUT' | 'PATCH' | 'GET'; auth: AuthType; header_name?: string; query_param?: string; content_type: ContentType; body_template: string; extra_headers?: Record<string, string>; url_placeholder?: string };
  /** Shown under the fields: what the tool will receive. */
  sample?: string;
}

const JSON_TEXT = '{"title":"{{title}}","text":"{{text}}","severity":"{{severity}}","event":"{{event}}","sent_at":"{{sent_at}}"}';

export const CONNECTION_PRESETS: ConnectionPreset[] = [
  {
    id: 'slack', name: 'Slack', tagline: 'Post to a channel', kind: 'slack', icon: 'MessageSquare',
    steps: ['In Slack open api.slack.com/apps and create an app (From scratch) for your workspace.', 'Turn on Incoming Webhooks, then Add New Webhook to Workspace and pick the channel.', 'Copy the webhook address (it starts with https://hooks.slack.com/services/) and paste it below.'],
    fields: [{ field: 'url', label: 'Slack webhook address', placeholder: 'https://hooks.slack.com/services/…', secret: true, required: true }],
    sample: 'A message with a bold title and the details.',
  },
  {
    id: 'cliq-api', name: 'Zoho Cliq (API, recommended)', tagline: 'Sign in with Zoho, post to a channel, tag the person and their manager', kind: 'cliq', mode: 'api', brand: 'cliq', icon: 'MessageSquare',
    steps: [
      'Open https://api-console.zoho.com (use the site for your data center if you are not on .com: api-console.zoho.eu, .in, .com.au, .jp, .ca or .sa). Choose "Add Client" and pick "Server-based Applications".',
      'Client Name: anything, for example "KD Ops Agent". Paste the Homepage URL and the Authorized Redirect URI shown in the boxes at the top of this window into Zoho exactly as they are (use the Copy buttons). Press Create.',
      'Zoho shows a Client ID and a Client Secret. Paste them below. Pick your data center and type the Channel unique name (in Cliq, open the channel, then Channel settings, then Unique name: lowercase, no spaces).',
      'Press Save, then "Connect to Zoho". Zoho asks you to allow access (scope ZohoCliq.Webhooks.CREATE, which only lets KD Ops post messages). Approve it and you come back here, connected. Nothing expires every hour.',
      'Press "Send test and tag me". If your name is highlighted in the channel, tagging works.',
    ],
    fields: [
      { field: 'dc', label: 'Data center', options: CLIQ_DATA_CENTERS, hint: 'The region of your Zoho account.' },
      { field: 'client_id', label: 'Client ID', placeholder: '1000.XXXXXXXXXXXXXXXX', required: true },
      { field: 'client_secret', label: 'Client secret', secret: true, required: true },
      { field: 'channel', label: 'Channel unique name', placeholder: 'opschannel', required: true, hint: 'Lowercase letters, numbers and underscores. No spaces.' },
      // Advanced: the Self Client way (a one-time grant code) or a refresh token you already have. Not needed with "Connect to Zoho".
      { field: 'grant_code', label: 'Grant code', secret: true, hint: 'Only if you use a Self Client in Zoho. The code works once and expires in about 10 minutes.' },
      { field: 'refresh_token', label: 'Refresh token (optional)', secret: true, hint: 'Only if you already have one.' },
    ],
    sample: 'A message with a bold title, a "For Cara: @Cara" tag line, "CC: @Dan" for their manager, the details and a link to the exact item.',
  },
  {
    id: 'cliq', name: 'Zoho Cliq (webhook address)', tagline: 'Post with a webhook address and tag the person', kind: 'cliq', mode: 'webhook', icon: 'MessageSquare',
    steps: [
      'In Zoho Cliq, set up an incoming webhook for the channel that should receive the messages (the ops channel), or for a bot that posts to it. Cliq gives you a web address that includes a secret key (zapikey).',
      'Copy that whole address, key included, and paste it below. It works like a password, so it is kept encrypted and never shown again.',
      'Leave "Tag the person in each message" on. When an item is about someone, the message tags them by their Cliq user id if you saved one in Settings, People, otherwise by their KD Ops email address (it must be the same email they use in Cliq).',
      'Press "Send test and tag me". If your name is highlighted in the channel, tagging works. If it shows as plain text like {@you@example.com}, change the tag format below (the default is {@%s}, where %s becomes the id or email) and test again.',
    ],
    fields: [{ field: 'url', label: 'Cliq webhook address', placeholder: 'https://cliq.zoho.com/api/v2/channelsbyname/…/message?zapikey=…', secret: true, required: true }],
    sample: 'A message with a bold title, a "For Cara: @Cara" tag line, the details and a link to the exact item.',
  },
  {
    id: 'teams', name: 'Microsoft Teams', tagline: 'Post to a channel', kind: 'teams', icon: 'MessageSquare',
    steps: ['In Teams open the channel, choose ... then Workflows, and pick "Post to a channel when a webhook request is received".', 'Finish the wizard and copy the address it shows.', 'Paste it below.'],
    fields: [{ field: 'url', label: 'Teams webhook address', placeholder: 'https://…logic.azure.com/… or https://….webhook.office.com/…', secret: true, required: true }],
  },
  {
    id: 'discord', name: 'Discord', tagline: 'Post to a channel', kind: 'discord', icon: 'MessageSquare',
    steps: ['In Discord open the channel settings, then Integrations, then Webhooks, and choose New Webhook.', 'Copy the Webhook URL.', 'Paste it below.'],
    fields: [{ field: 'url', label: 'Discord webhook address', placeholder: 'https://discord.com/api/webhooks/…', secret: true, required: true }],
  },
  {
    id: 'gchat', name: 'Google Chat', tagline: 'Post to a space', kind: 'gchat', icon: 'MessageSquare',
    steps: ['In Google Chat open the space, choose its name, then Apps & integrations, then Webhooks.', 'Add a webhook, name it, and copy the address.', 'Paste it below.'],
    fields: [{ field: 'url', label: 'Google Chat webhook address', placeholder: 'https://chat.googleapis.com/v1/spaces/…', secret: true, required: true }],
  },
  {
    id: 'telegram', name: 'Telegram', tagline: 'Message a chat or group', kind: 'telegram', icon: 'Send',
    steps: ['In Telegram message @BotFather, send /newbot and follow the steps. Copy the bot token it gives you.', 'Add the bot to the chat or group, or start a chat with it, and send it a message.', 'Open https://api.telegram.org/bot<TOKEN>/getUpdates in a browser and copy the chat id (the number after "chat":{"id":).'],
    fields: [
      { field: 'token', label: 'Bot token', placeholder: '123456:ABC-DEF…', secret: true, required: true },
      { field: 'chat_id', label: 'Chat id', placeholder: '-1001234567890', required: true },
    ],
  },
  {
    id: 'email', name: 'Email', tagline: 'Send an email', kind: 'email', icon: 'Mail',
    steps: ['Enter the address (or up to five, separated by commas) that should receive the messages.', 'Emails go out through KD Ops, so nothing else needs setting up.'],
    fields: [{ field: 'to', label: 'Send to', placeholder: 'ops@example.com, hr@example.com', required: true }],
  },
  {
    id: 'zapier', name: 'Zapier', tagline: 'Start a Zap with the data', kind: 'webhook', icon: 'Workflow',
    steps: ['In Zapier create a Zap and choose "Webhooks by Zapier" as the trigger with the event "Catch Hook".', 'Copy the Custom Webhook URL it shows.', 'Paste it below, press Send test, then use that sample in Zapier to map the fields (title, text, severity, event, sent_at).'],
    fields: [{ field: 'url', label: 'Catch Hook URL', placeholder: 'https://hooks.zapier.com/hooks/catch/…', required: true }],
    sample: '{"source":"kd-ops-agent","event":"flag","title":"…","text":"…","sent_at":"…"}',
  },
  {
    id: 'make', name: 'Make', tagline: 'Start a scenario with the data', kind: 'webhook', icon: 'Workflow',
    steps: ['In Make create a scenario and add the "Webhooks" module, choosing "Custom webhook".', 'Add a webhook, copy its address.', 'Paste it below, press Send test, and let Make learn the data structure from it.'],
    fields: [{ field: 'url', label: 'Webhook address', placeholder: 'https://hook.eu1.make.com/…', required: true }],
  },
  {
    id: 'n8n', name: 'n8n', tagline: 'Start a workflow with the data', kind: 'n8n', icon: 'Workflow',
    steps: ['In n8n add a Webhook node (method POST) to a workflow and copy its Production URL.', 'Optional: add a secret below. Every call then carries a signature header (X-KDOps-Signature, HMAC-SHA256) your workflow can verify.', 'Paste the URL below and press Send test (use "Listen for test event" in n8n first).'],
    fields: [
      { field: 'url', label: 'Webhook URL', placeholder: 'https://your-n8n.example.com/webhook/…', required: true },
      { field: 'token', label: 'Secret (optional)', secret: true },
    ],
  },
  {
    id: 'webhook', name: 'Any webhook', tagline: 'A web address that accepts data', kind: 'webhook', icon: 'Webhook',
    steps: ['Get the address the other tool gives you for receiving data (often called a webhook, "catch hook" or "incoming request").', 'Paste it below. Optional: a secret makes every call signed (X-KDOps-Signature, HMAC-SHA256) and adds an Authorization: Bearer header.', 'Press Send test. The tool receives a JSON body: source, event, title, text and sent_at.'],
    fields: [
      { field: 'url', label: 'Address', placeholder: 'https://…', required: true },
      { field: 'token', label: 'Secret (optional)', secret: true },
    ],
    sample: '{"source":"kd-ops-agent","event":"flag","title":"…","text":"…","sent_at":"…"}',
  },
  {
    id: 'airtable', name: 'Airtable', tagline: 'Add a row to a table', kind: 'api', icon: 'Table2',
    steps: ['In Airtable create a personal access token (airtable.com/create/tokens) with the data.records:write scope for your base.', 'Find your base id (starts with app) and table name in the API docs for the base (airtable.com/developers/web/api/introduction).', 'Put them in the address below, paste the token, and rename the field names in the body to match your table’s columns.'],
    fields: [
      { field: 'url', label: 'Address', placeholder: 'https://api.airtable.com/v0/appXXXXXXXX/Alerts', required: true },
      { field: 'token', label: 'Personal access token', secret: true, required: true },
      { field: 'body_template', label: 'Body', hint: 'Change the left-hand names to your column names.' },
    ],
    api: { method: 'POST', auth: 'bearer', content_type: 'json', body_template: '{"records":[{"fields":{"Title":"{{title}}","Details":"{{text}}","Severity":"{{severity}}","Event":"{{event}}"}}]}' },
  },
  {
    id: 'trello', name: 'Trello', tagline: 'Create a card in a list', kind: 'api', icon: 'KanbanSquare',
    steps: ['Get your API key and token from trello.com/power-ups/admin (create a Power-Up, then Generate a token).', 'Find the list id: open the board, add .json to its address, and look for the list id.', 'Fill the address below with your key and list id, and paste your token.'],
    fields: [
      { field: 'url', label: 'Address', placeholder: 'https://api.trello.com/1/cards?key=YOUR_KEY&idList=YOUR_LIST_ID', required: true },
      { field: 'token', label: 'Token', secret: true, required: true },
    ],
    api: { method: 'POST', auth: 'query', query_param: 'token', content_type: 'json', body_template: '{"name":"{{title}}","desc":"{{text}}"}' },
  },
  {
    id: 'clickup', name: 'ClickUp', tagline: 'Create a task in a list', kind: 'api', icon: 'KanbanSquare',
    steps: ['In ClickUp open Settings, Apps, and generate a personal API token.', 'Find the list id (open the list, it is in the address after /li/ or in the list menu "Copy ID").', 'Put the list id in the address below and paste the token.'],
    fields: [
      { field: 'url', label: 'Address', placeholder: 'https://api.clickup.com/api/v2/list/YOUR_LIST_ID/task', required: true },
      { field: 'token', label: 'API token', secret: true, required: true },
    ],
    api: { method: 'POST', auth: 'header', header_name: 'Authorization', content_type: 'json', body_template: '{"name":"{{title}}","description":"{{text}}"}' },
  },
  {
    id: 'notion', name: 'Notion', tagline: 'Add a page to a database', kind: 'api', icon: 'FileText',
    steps: ['In Notion create an internal integration (notion.so/my-integrations) and copy its secret.', 'Open the database, choose ... then Connections, and add your integration.', 'Copy the database id (the long id in its address) into the body below, and make sure the property names match your database (Name is the title column).'],
    fields: [
      { field: 'url', label: 'Address', placeholder: 'https://api.notion.com/v1/pages', required: true },
      { field: 'token', label: 'Integration secret', secret: true, required: true },
      { field: 'body_template', label: 'Body', hint: 'Replace YOUR_DATABASE_ID.' },
    ],
    api: { method: 'POST', auth: 'bearer', content_type: 'json', extra_headers: { 'Notion-Version': '2022-06-28' },
      body_template: '{"parent":{"database_id":"YOUR_DATABASE_ID"},"properties":{"Name":{"title":[{"text":{"content":"{{title}}"}}]}},"children":[{"object":"block","type":"paragraph","paragraph":{"rich_text":[{"text":{"content":"{{text}}"}}]}}]}' },
  },
  {
    id: 'twilio', name: 'Twilio (SMS or WhatsApp)', tagline: 'Send a text message', kind: 'api', icon: 'Phone',
    steps: ['In Twilio find your Account SID and Auth Token (console.twilio.com).', 'Use a Twilio number (or the WhatsApp sandbox number prefixed with whatsapp:) as From, and the receiving number as To.', 'Put your SID in the address, paste "SID:AuthToken" as the token, and edit From and To in the body.'],
    fields: [
      { field: 'url', label: 'Address', placeholder: 'https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Messages.json', required: true },
      { field: 'token', label: 'SID:AuthToken', secret: true, required: true, hint: 'Your Account SID, a colon, then your Auth Token.' },
      { field: 'body_template', label: 'Body', hint: 'Edit From and To.' },
    ],
    api: { method: 'POST', auth: 'basic', content_type: 'form', body_template: 'From=%2B15551234567&To=%2B15557654321&Body={{title}}: {{text}}' },
  },
  {
    id: 'custom', name: 'Any other tool (API)', tagline: 'Send data to any tool with an API', kind: 'api', icon: 'Plug',
    steps: ['Open the tool’s API documentation and find the call that creates something (a message, a row, a task, a record). Note its address, method (usually POST), and how it wants you to prove who you are (an API key or token).', 'Enter the address, choose how the token is sent (Bearer header, a named header, Basic, or in the address), and paste the token.', 'Write the body the tool expects. Put {{title}}, {{text}}, {{severity}}, {{event}}, {{rule}}, {{person}} and {{sent_at}} where the data should go. Press Send test to see if the tool accepts it.'],
    fields: [
      { field: 'url', label: 'Address', placeholder: 'https://api.example.com/v1/messages', required: true },
      { field: 'token', label: 'API key or token', secret: true },
      { field: 'body_template', label: 'Body' },
    ],
    api: { method: 'POST', auth: 'bearer', content_type: 'json', body_template: JSON_TEXT },
  },
];

export const presetById = (id: string) => CONNECTION_PRESETS.find((p) => p.id === id);
