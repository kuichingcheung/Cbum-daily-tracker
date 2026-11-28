/**
 * Public GET for the diet document. Writes are not implemented.
 * TURSO_DATABASE_URL and TURSO_AUTH_TOKEN come from the Vercel project.
 * Use a read-only Turso token. Never send that token to the browser.
 */

import { createClient } from '@libsql/client/web';
import { dietHttpResult, readPublishedDiet } from '../js/diet-read.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    const missing = dietHttpResult({ code: 'NO_TURSO_ENV' });
    return Response.json(missing.body, { status: missing.status, headers: CORS });
  }

  try {
    const client = createClient({ url, authToken });
    const diet = await readPublishedDiet((sql) => client.execute(sql));
    return Response.json(diet, { headers: CORS });
  } catch (error) {
    const result = dietHttpResult(error);
    if (result.status === 500) {
      console.error('diet read failed', error?.code || error?.message || 'unknown');
    }
    return Response.json(result.body, { status: result.status, headers: CORS });
  }
}
