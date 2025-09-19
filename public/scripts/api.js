const apiBase = window.POLYWORLD_CONFIG.apiBase;

export async function post(path, body) {
  const res = await fetch(\`\${apiBase}/\${path}\`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body||{})
  });
  if(!res.ok){ throw new Error(\`API \${path} failed: \${res.status}\`); }
  return res.json();
}
export async function get(path) {
  const res = await fetch(\`\${apiBase}/\${path}\`);
  if(!res.ok){ throw new Error(\`API \${path} failed: \${res.status}\`); }
  return res.json();
}