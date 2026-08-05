import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from './ollama.provider.js';

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url, init) => {
      return new Promise((resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should successfully parse and return text from a 200 OK Ollama response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        response: 'This is a mocked Llama response',
        done: true
      })
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const provider = new OllamaProvider('http://localhost:11434', 'llama3:latest');
    const resultPromise = provider.send({ prompt: 'Hello' });
    
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(fetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        model: 'llama3:latest',
        prompt: 'Hello',
        stream: false
      })
    }));

    expect(result.text).toBe('This is a mocked Llama response');
    expect(result.raw).toEqual({ response: 'This is a mocked Llama response', done: true });
  });

  it('should throw a friendly error message on fetch failure (network error)', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fetch failed'));

    const provider = new OllamaProvider('http://localhost:11434', 'llama3:latest');
    
    await expect(provider.send({ prompt: 'Hello' }))
      .rejects
      .toThrow('Failed to communicate with Ollama at http://localhost:11434: fetch failed');
  });

  it('should throw a friendly error message on non-200 HTTP response', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const provider = new OllamaProvider('http://localhost:11434', 'llama3:latest');
    
    await expect(provider.send({ prompt: 'Hello' }))
      .rejects
      .toThrow('Failed to communicate with Ollama at http://localhost:11434: Ollama API error: 500 Internal Server Error');
  });

  it('should throw a timeout error if the request exceeds the 60s limit', async () => {
    const provider = new OllamaProvider('http://localhost:11434', 'llama3:latest');
    
    const sendPromise = provider.send({ prompt: 'Hello' });
    
    const expectPromise = expect(sendPromise)
      .rejects
      .toThrow('Ollama request timed out after 60 seconds.');

    // Advance timers by 61 seconds
    await vi.advanceTimersByTimeAsync(61000);

    await expectPromise;
  });
});
