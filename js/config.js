/**
 * Public diet read endpoint. GitHub Pages cannot talk to Turso, so the
 * tracker calls this URL. It is only a GET; the Turso token stays on Vercel.
 * Change the origin if the Vercel project URL is different.
 */
export const DIET_API_ORIGIN = 'https://cbum-daily-tracker.vercel.app';
