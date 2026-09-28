let token: string | undefined;
let loading: Promise<string> | undefined;
async function controlToken() {
  if (token) return token;
  loading ??= fetch('/api/control-session', { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('Không lấy được phiên điều khiển.');
    const body = await response.json() as { token: string };
    if (typeof body.token !== 'string' || body.token.length !== 64) throw new Error('Phiên điều khiển lỗi.');
    return token = body.token;
  }).finally(() => { loading = undefined; });
  return loading;
}
export async function controlRequest(url: string, init: RequestInit = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = new Headers(init.headers); headers.set('x-virtualhud-control', await controlToken());
    const response = await fetch(url, { ...init, method: init.method ?? 'POST', headers });
    if (response.status === 403 && attempt === 0) {
      const error = await response.clone().json().catch(() => ({}));
      if (error.code === 'CONTROL_REQUIRED') { token = undefined; continue; }
    }
    return response;
  }
  throw new Error('Phiên điều khiển hết hạn.');
}
