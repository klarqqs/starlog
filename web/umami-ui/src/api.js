export async function api(url, opts = {}) {
  const r = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (r.status === 204) return { status: r.status, body: {} };
  const text = await r.text();
  try {
    return { status: r.status, body: text ? JSON.parse(text) : {} };
  } catch {
    return { status: r.status, body: { error: 'Stellog could not reach its API from this host.' } };
  }
}

export function snippet(id) {
  return `<script defer src="${location.origin}/s.js" data-site="${id}"></script>`;
}

export function accountLabel(user) {
  if (user.wallet) return `${user.wallet.slice(0, 4)}…${user.wallet.slice(-4)}`;
  return user.email;
}
