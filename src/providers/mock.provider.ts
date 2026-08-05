import { AIProvider, AIProviderRequest, AIProviderResponse } from './ai-provider.interface.js';

export class MockProvider implements AIProvider {
  name = 'MockProvider';

  async send(request: AIProviderRequest): Promise<AIProviderResponse> {
    return {
      text: `Echo: ${request.prompt}\n[mock response]`,
      raw: { simulated_latency_ms: 150, received_context: !!request.context }
    };
  }
}
