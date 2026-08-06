import { describe, it, expect } from 'vitest';
import { MockProvider } from './mock.provider.js';

describe('MockProvider', () => {
  it('should return a deterministic echo response', async () => {
    const provider = new MockProvider();
    
    expect(provider.name).toBe('mock');
    
    const response = await provider.send({ prompt: 'Hello world' });
    
    expect(response.text).toBe('Echo: Hello world\n[mock response]');
    expect(response.raw).toEqual({ simulated_latency_ms: 150, received_context: false });
  });

  it('should reflect context in the raw response', async () => {
    const provider = new MockProvider();
    
    const response = await provider.send({ prompt: 'Hello', context: 'Some context' });
    
    expect(response.raw).toEqual({ simulated_latency_ms: 150, received_context: true });
  });
});
