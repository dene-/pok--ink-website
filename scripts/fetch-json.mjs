export async function fetchJson(fetchImpl, url, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs) || 0);
  const requestLabel = options.requestLabel || url;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
    try {
      const response = await fetchImpl(url, { cache: 'no-store', headers: options.headers, signal: controller.signal });
      if (!response.ok) throw new Error(`${requestLabel} HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = new Error(`${requestLabel}: request failed (${error.name || 'Error'})`);
      if (error.message?.startsWith(`${requestLabel} HTTP `)) lastError = error;
      if (attempt < attempts && retryDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

