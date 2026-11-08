/**
 * Public API base for the beacon and the forms (e.g. "/api" when the API is on the same host).
 * Empty: the site still builds and works; analytics are off and the waitlist / try forms are hidden.
 */
export const API = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
