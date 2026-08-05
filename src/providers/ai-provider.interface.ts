export interface AIProviderRequest {
  prompt: string;
  context?: string;
}

export interface AIProviderResponse {
  text: string;
  raw: unknown;
}

export interface AIProvider {
  name: string;
  send(request: AIProviderRequest): Promise<AIProviderResponse>;
}
