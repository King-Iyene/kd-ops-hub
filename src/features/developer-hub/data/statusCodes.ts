/** HTTP status codes the /v1 REST API returns, and what to do about each. */

export interface StatusCodeEntry {
  code: number;
  meaning: string;
  action: string;
  color: 'green' | 'red' | 'amber' | 'blue';
}

export const STATUS_CODES: StatusCodeEntry[] = [
  { code: 200, meaning: 'Success', action: 'Request completed. Parse the response body.', color: 'green' },
  { code: 201, meaning: 'Created', action: 'Resource was created successfully.', color: 'green' },
  { code: 400, meaning: 'Bad Request', action: 'Check your request body — a required field is missing or has the wrong type. The error message tells you which field.', color: 'red' },
  { code: 401, meaning: 'Unauthorized', action: 'Your API key is missing, invalid, revoked, or expired. Go to API Keys → create a new one.', color: 'red' },
  { code: 403, meaning: 'Forbidden', action: "Your key doesn't have the required scope. E.g., you need records:write to create records. Create a new key with the right scopes.", color: 'red' },
  { code: 404, meaning: 'Not Found', action: "The base, table, record, or field doesn't exist. Check the ID or slug in your URL — use the short ID, not the raw UUID.", color: 'amber' },
  { code: 405, meaning: 'Method Not Allowed', action: "That HTTP method isn't supported on this route (e.g. DELETE on /bases). Check the method against the endpoint's documented verbs.", color: 'amber' },
  { code: 422, meaning: 'Unprocessable', action: 'Validation failed — including a duplicate value on a unique column. The error message lists what\'s wrong, e.g. "A unique constraint was violated — duplicate value".', color: 'amber' },
  { code: 429, meaning: 'Too Many Requests', action: 'Rate limited. Wait 60 seconds and retry. Consider adding delays between batch requests.', color: 'red' },
  { code: 500, meaning: 'Server Error', action: 'Something went wrong on our end. Retry after a few seconds. If persistent, check the KDOps status.', color: 'red' },
];
