export default async function handler(request, context) {
  const renderUrl = Deno.env.get('RENDER_URL');
  if (!renderUrl) {
    return new Response(JSON.stringify({ error: 'RENDER_URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const targetUrl = renderUrl.replace(/\/$/, '') + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', url.hostname);

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('Cache-Control', 'no-store');

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export const config = {
  path: ['/api/*'],
  excludedPath: ['/api/admin-panel', '/api/admin-panel/*'],
};
