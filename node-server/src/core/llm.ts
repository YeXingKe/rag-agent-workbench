import { getSettings } from '../config/settings.js';

const CHAT_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatToolCall {
  id: string;
  type?: string;
  index?: number;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
}

export interface ChatOptions {
  streaming?: boolean;
  temperature?: number;
  model?: string;
  tools?: unknown[];
}

export interface ChatCompletionResult {
  content: string;
  tool_calls: ChatToolCall[];
  finish_reason: string | null;
}

export interface ChatStreamDelta {
  content?: string;
  tool_calls?: ChatToolCall[];
  finish_reason?: string | null;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ChatToolCall[];
    };
    delta?: {
      content?: string | null;
      tool_calls?: ChatToolCall[];
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string; code?: string };
}

async function postChat(
  messages: ChatMessage[],
  options: ChatOptions,
  stream: boolean,
): Promise<Response> {
  const settings = getSettings();
  if (!settings.dashscopeApiKey) {
    throw new Error('DASHSCOPE_API_KEY is not configured');
  }

  const body: Record<string, unknown> = {
    model: options.model ?? settings.model,
    messages,
    temperature: options.temperature ?? 0.1,
    stream,
  };
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  const response = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.dashscopeApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`DashScope chat failed: ${response.status} ${responseBody}`);
  }

  return response;
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatCompletionResult> {
  const response = await postChat(messages, options, false);
  const payload = (await response.json()) as ChatCompletionResponse;
  if (payload.error) {
    throw new Error(`DashScope chat failed: ${payload.error.code ?? ''} ${payload.error.message ?? ''}`.trim());
  }
  const choice = payload.choices?.[0];
  return {
    content: choice?.message?.content ?? '',
    tool_calls: choice?.message?.tool_calls ?? [],
    finish_reason: choice?.finish_reason ?? null,
  };
}

export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const result = await chatCompletion(messages, options);
  return result.content;
}

export async function* streamChatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {},
): AsyncGenerator<ChatStreamDelta, void, unknown> {
  const response = await postChat(messages, options, true);
  if (!response.body) {
    throw new Error('DashScope chat stream returned an empty body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }
      const data = trimmed.slice('data:'.length).trim();
      if (!data || data === '[DONE]') {
        if (data === '[DONE]') {
          return;
        }
        continue;
      }
      const payload = JSON.parse(data) as ChatCompletionResponse;
      const choice = payload.choices?.[0];
      const delta = choice?.delta;
      yield {
        content: delta?.content ?? undefined,
        tool_calls: delta?.tool_calls,
        finish_reason: choice?.finish_reason ?? null,
      };
    }
  }
}

export async function* streamChat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  for await (const delta of streamChatCompletion(messages, options)) {
    if (delta.content) {
      yield delta.content;
    }
  }
}

export function getLlm(options: ChatOptions = {}) {
  const temperature = options.temperature ?? 0.1;
  return {
    streaming: options.streaming ?? false,
    temperature,
    async invoke(messages: ChatMessage[]): Promise<string> {
      return chat(messages, { ...options, temperature });
    },
    stream(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
      return streamChat(messages, { ...options, temperature, streaming: true });
    },
    async complete(messages: ChatMessage[]): Promise<ChatCompletionResult> {
      return chatCompletion(messages, { ...options, temperature });
    },
    streamCompletion(messages: ChatMessage[]): AsyncGenerator<ChatStreamDelta, void, unknown> {
      return streamChatCompletion(messages, { ...options, temperature, streaming: true });
    },
  };
}
