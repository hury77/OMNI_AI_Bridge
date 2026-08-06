export interface AIProviderRequest {
  prompt: string;
  context?: string;
}

export interface AIProviderResponse {
  text: string;
  raw: unknown;
}

export interface AIProvider {
  /**
   * The technical name of the provider (e.g., 'mock', 'ollama')
   */
  readonly name: string;
  send(request: AIProviderRequest): Promise<AIProviderResponse>;
}
