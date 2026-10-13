import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchArrayBuffer, fetchJsonCached, resetAssetCache } from '../src/proto3d/asset-cache';

describe('asset cache', () => {
  afterEach(() => {
    resetAssetCache();
    vi.unstubAllGlobals();
  });

  it('fetches each URL only once while the first promise is in flight', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls += 1;
        await Promise.resolve();
        const body = url.endsWith('.json') ? '{"ok":true}' : 'abc';
        return new Response(body, { status: 200 });
      })
    );
    const [a, b, json] = await Promise.all([
      fetchArrayBuffer('/font_5x7.json'),
      fetchArrayBuffer('/font_5x7.json'),
      fetchJsonCached<{ ok: boolean }>('/font_5x7.json')
    ]);
    expect(calls).toBe(1);
    expect(a.byteLength).toBeGreaterThan(0);
    expect(b.byteLength).toBe(a.byteLength);
    expect(json.ok).toBe(true);
  });
});
