export type Provider = { id: string; domain: string };

const PROVIDERS: Provider[] = [
  { id: "chatgpt", domain: "chatgpt.com" },
  { id: "claude", domain: "claude.ai" },
  { id: "gemini", domain: "gemini.google.com" },
  { id: "copilot", domain: "copilot.microsoft.com" },
  { id: "perplexity", domain: "perplexity.ai" },
  { id: "grok", domain: "grok.com" }
];

export function providerForHost(host: string): Provider | undefined {
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return PROVIDERS.find((item) => normalized === item.domain || normalized.endsWith("." + item.domain));
}
