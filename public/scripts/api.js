const apiBase = window.POLYWORLD_CONFIG.apiBase || '';

export async function post(path, body) {
  const res = await fetch(`${apiBase}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return res.json();
}