import { AIProvider, AIProviderRequest, AIProviderResponse } from './ai-provider.interface.js';

export class OllamaProvider implements AIProvider {
  name = 'OllamaProvider';

  constructor(private baseUrl: string, private model: string) {}

  async send(request: AIProviderRequest): Promise<AIProviderResponse> {
    const endpoint = `${this.baseUrl}/api/generate`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 60000);

    const promptText = request.context 
      ? `Context from file:\n---\n${request.context}\n---\n\nQuestion: ${request.prompt}` 
      : request.prompt;

    const payload = {
      model: this.model,
      prompt: promptText,
      stream: false
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        text: data.response,
        raw: data
      };
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Ollama request timed out after 60 seconds.');
      }
      throw new Error(`Failed to communicate with Ollama at ${this.baseUrl}: ${error.message}`);
    }
  }
}
