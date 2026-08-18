import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';

import { getCheckpointer } from './memory.js';
import { RAG_AGENT_SYSTEM_PROMPT } from './prompts.js';
import { SEARCH_KNOWLEDGE_BASE_TOOL, searchKnowledgeBase } from './tools.js';
import {
  chatCompletion,
  streamChatCompletion,
  type ChatMessage,
  type ChatToolCall,
} from '../core/llm.js';
import { logger } from '../utils/logger.js';

const MAX_AGENT_ITERATIONS = 12;

export type AgentRoleMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
};

export type AgentInvokeInput = {
  messages: Array<AgentRoleMessage | BaseMessage>;
};

export type AgentConfig = {
  configurable?: {
    thread_id?: string;
  };
};

export type AgentStreamEvent = {
  mode: 'messages' | 'updates';
  chunk: unknown;
};

type AssistantTurn = {
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
};

function toText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === 'string') {
          return block;
        }
        if (block && typeof block === 'object' && 'text' in block) {
          return String((block as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  }
  if (content == null) {
    return '';
  }
  return String(content);
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string' || !raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function normalizeToolCalls(raw: unknown): AssistantTurn['toolCalls'] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  return (raw as ChatToolCall[]).map((item, index) => ({
    id: String(item.id ?? `call_${index + 1}`),
    name: String(item.function?.name ?? 'search_knowledge_base'),
    args: parseToolArguments(item.function?.arguments),
  }));
}

function mergeToolCallDeltas(target: ChatToolCall[], incoming: ChatToolCall[]): void {
  for (const item of incoming) {
    const index = typeof item.index === 'number' ? item.index : Math.max(target.length - 1, 0);
    const current = target[index] ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
    current.id = item.id || current.id;
    current.type = item.type ?? current.type ?? 'function';
    current.function = {
      name: item.function?.name || current.function?.name || '',
      arguments: `${current.function?.arguments ?? ''}${item.function?.arguments ?? ''}`,
    };
    target[index] = current;
  }
}

function toOpenAIMessages(messages: BaseMessage[]): ChatMessage[] {
  return messages.map((message) => {
    const type = message._getType();
    if (type === 'system') {
      return { role: 'system', content: toText(message.content) };
    }
    if (type === 'human') {
      return { role: 'user', content: toText(message.content) };
    }
    if (type === 'tool') {
      const toolMessage = message as ToolMessage;
      return {
        role: 'tool',
        content: toText(toolMessage.content),
        tool_call_id: toolMessage.tool_call_id,
        name: typeof toolMessage.name === 'string' ? toolMessage.name : 'search_knowledge_base',
      };
    }

    const aiMessage = message as AIMessage;
    const toolCalls = normalizeToolCalls(aiMessage.tool_calls);
    const content = toText(aiMessage.content);
    return {
      role: 'assistant',
      content: content || (toolCalls.length > 0 ? null : ''),
      tool_calls:
        toolCalls.length > 0
          ? toolCalls.map((toolCall) => ({
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.args ?? {}),
              },
            }))
          : undefined,
    };
  });
}

function toBaseMessages(messages: Array<AgentRoleMessage | BaseMessage>): BaseMessage[] {
  return messages.map((message) => {
    if (message instanceof BaseMessage) {
      return message;
    }
    if (message.role === 'system') {
      return new SystemMessage({ content: message.content });
    }
    if (message.role === 'user') {
      return new HumanMessage({ content: message.content });
    }
    if (message.role === 'tool') {
      return new ToolMessage({
        content: message.content,
        tool_call_id: message.tool_call_id ?? '',
        name: message.name,
      });
    }
    const toolCalls = normalizeToolCalls(message.tool_calls);
    return new AIMessage({
      content: message.content ?? '',
      tool_calls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        args: toolCall.args,
        type: 'tool_call' as const,
      })),
    });
  });
}

function createAiMessage(turn: AssistantTurn): AIMessage {
  return new AIMessage({
    content: turn.content,
    tool_calls: turn.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.name,
      args: toolCall.args,
      type: 'tool_call' as const,
    })),
  });
}

function createToolMessage(params: {
  toolCallId: string;
  content: string;
  status: 'success' | 'error';
}): ToolMessage {
  const message = new ToolMessage({
    content: params.content,
    tool_call_id: params.toolCallId,
    name: 'search_knowledge_base',
  });
  Object.assign(message, { status: params.status });
  return message;
}

async function completeChat(messages: BaseMessage[]): Promise<AssistantTurn> {
  const result = await chatCompletion(toOpenAIMessages(messages), {
    temperature: 0.1,
    tools: [SEARCH_KNOWLEDGE_BASE_TOOL],
  });
  return {
    content: result.content ?? '',
    toolCalls: normalizeToolCalls(result.tool_calls),
  };
}

async function* streamAssistantTurn(messages: BaseMessage[]): AsyncGenerator<{
  textDelta: string;
  turn: AssistantTurn | null;
}> {
  let content = '';
  const toolCallBuffer: ChatToolCall[] = [];
  for await (const delta of streamChatCompletion(toOpenAIMessages(messages), {
    temperature: 0.1,
    tools: [SEARCH_KNOWLEDGE_BASE_TOOL],
    streaming: true,
  })) {
    if (delta.content) {
      content += delta.content;
      yield { textDelta: delta.content, turn: null };
    }
    if (delta.tool_calls && delta.tool_calls.length > 0) {
      mergeToolCallDeltas(toolCallBuffer, delta.tool_calls);
    }
  }
  yield {
    textDelta: '',
    turn: {
      content,
      toolCalls: normalizeToolCalls(toolCallBuffer),
    },
  };
}

async function executeToolCall(toolCall: AssistantTurn['toolCalls'][number]): Promise<ToolMessage> {
  try {
    if (toolCall.name !== 'search_knowledge_base') {
      throw new Error(`Unknown tool: ${toolCall.name}`);
    }
    const query = String(toolCall.args.query ?? '');
    const topKRaw = toolCall.args.top_k ?? toolCall.args.topK ?? 5;
    const topK = Number(topKRaw);
    const content = await searchKnowledgeBase(query, Number.isFinite(topK) ? topK : 5);
    return createToolMessage({ toolCallId: toolCall.id, content, status: 'success' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Tool ${toolCall.name} failed: ${message}`);
    return createToolMessage({
      toolCallId: toolCall.id,
      content: message,
      status: 'error',
    });
  }
}

function withSystemPrompt(messages: BaseMessage[]): BaseMessage[] {
  return [new SystemMessage({ content: RAG_AGENT_SYSTEM_PROMPT }), ...messages];
}

function threadIdFromConfig(config?: AgentConfig): string {
  return config?.configurable?.thread_id || 'default';
}

function persistableMessages(messages: BaseMessage[]): BaseMessage[] {
  return messages.filter(
    (message) => message._getType() !== 'system' || toText(message.content) !== RAG_AGENT_SYSTEM_PROMPT,
  );
}

export class RagAgent {
  async invoke(input: AgentInvokeInput, config?: AgentConfig): Promise<{ messages: BaseMessage[] }> {
    const checkpointer = getCheckpointer();
    const threadId = threadIdFromConfig(config);
    const incoming = toBaseMessages(input.messages);
    let messages = withSystemPrompt([...checkpointer.get(threadId), ...incoming]);

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration += 1) {
      const turn = await completeChat(messages);
      const aiMessage = createAiMessage(turn);
      messages = [...messages, aiMessage];
      if (turn.toolCalls.length === 0) {
        break;
      }
      const toolMessages: ToolMessage[] = [];
      for (const toolCall of turn.toolCalls) {
        toolMessages.push(await executeToolCall(toolCall));
      }
      messages = [...messages, ...toolMessages];
    }

    checkpointer.set(threadId, persistableMessages(messages));
    return { messages };
  }

  async *stream(
    input: AgentInvokeInput,
    config?: AgentConfig,
    _streamMode?: string[],
  ): AsyncGenerator<AgentStreamEvent> {
    const checkpointer = getCheckpointer();
    const threadId = threadIdFromConfig(config);
    const incoming = toBaseMessages(input.messages);
    let messages = withSystemPrompt([...checkpointer.get(threadId), ...incoming]);

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration += 1) {
      let turn: AssistantTurn | null = null;
      for await (const part of streamAssistantTurn(messages)) {
        if (part.textDelta) {
          yield {
            mode: 'messages',
            chunk: [
              {
                content_blocks: [{ type: 'text', text: part.textDelta }],
                text: part.textDelta,
                content: part.textDelta,
              },
              { langgraph_node: 'model' },
            ],
          };
        }
        if (part.turn) {
          turn = part.turn;
        }
      }

      if (!turn) {
        break;
      }

      const aiMessage = createAiMessage(turn);
      messages = [...messages, aiMessage];
      yield {
        mode: 'updates',
        chunk: {
          model: {
            messages: [aiMessage],
          },
        },
      };

      if (turn.toolCalls.length === 0) {
        break;
      }

      for (const toolCall of turn.toolCalls) {
        const toolMessage = await executeToolCall(toolCall);
        messages = [...messages, toolMessage];
        yield {
          mode: 'updates',
          chunk: {
            tools: {
              messages: [toolMessage],
            },
          },
        };
      }
    }

    checkpointer.set(threadId, persistableMessages(messages));
  }
}

let cachedAgent: RagAgent | null = null;

export function getRagAgent(): RagAgent {
  if (cachedAgent == null) {
    cachedAgent = new RagAgent();
  }
  return cachedAgent;
}
