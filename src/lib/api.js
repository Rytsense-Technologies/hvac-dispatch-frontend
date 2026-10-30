// Talking to the API. Same-origin session cookie (hvac_user_session, HttpOnly), CSRF token kept in memory only.

// The console is served from the same address as the API (the frontend server forwards /v1), so the browser's session cookie
// is first-party. The cookie cannot be read by this script; only the CSRF token is kept here, in memory, never in storage.
let csrfToken = null;
let onExpired = () => {};

export const setCsrf = (token) => { csrfToken = token || null; };
export const onSessionExpired = (handler) => { onExpired = handler; };

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function messageFrom(body, status) {
  const detail = body && body.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || String(d)).join('; ');
  if (status === 403) return 'Your role cannot do that.';
  if (status === 404) return 'Not found.';
  if (status >= 500) return 'The server had a problem. Try again in a moment.';
  return `Request failed (${status}).`;
}

export async function api(path, { method = 'GET', params, body, headers = {} } = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params || {})) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  const options = { method, headers: { Accept: 'application/json', ...headers }, credentials: 'same-origin' };
  if (method !== 'GET' && csrfToken) options.headers['X-CSRF-Token'] = csrfToken;
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // /v1/auth/* covers sign-in, registration, "who am I" and password reset - an expected 401 happens there
    // before anyone is signed in, so it must not trigger the "your session ended" handling the rest of the app uses.
    if (response.status === 401 && !path.startsWith('/v1/auth/')) onExpired();
    throw new ApiError(messageFrom(data, response.status), response.status);
  }
  return data;
}

