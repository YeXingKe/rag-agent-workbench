/**
 * RAG Agent 组装与 ReAct 循环实现。
 *
 * Node 端未直接使用 LangGraph createAgent，而是自实现：
 * 模型推理 →（可选）工具调用 → 再推理，直到无 tool_calls 或达到迭代上限。
 * 对外暴露 invoke / stream，事件形状尽量对齐 LangGraph 的 updates / messages，
 * 以便 ChatService 的 SSE 适配逻辑复用。
 */

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

/** ReAct 最大迭代次数，防止工具循环失控。 */
const MAX_AGENT_ITERATIONS = 12;

/** 简化的角色消息（API / Service 侧常用）。 */
export type AgentRoleMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
};

/** Agent.invoke / stream 的输入：本轮新增消息列表。 */
export type AgentInvokeInput = {
  messages: Array<AgentRoleMessage | BaseMessage>;
};

/** 运行配置：thread_id 用于多轮记忆。 */
export type AgentConfig = {
  configurable?: {
    thread_id?: string;
  };
};

/**
 * 流式事件：
 * - mode=messages：token 级文本增量（供 SSE token）
 * - mode=updates：图节点更新（含 AI tool_calls 或 ToolMessage，供 SSE tool_*）
 */
export type AgentStreamEvent = {
  mode: 'messages' | 'updates';
  chunk: unknown;
};

/** 单次模型回合：正文 + 可选工具调用列表。 */
type AssistantTurn = {
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
};

/** 把 message.content（字符串或 content blocks）抽成纯文本。 */
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

/** 解析工具参数：对象直接用，字符串尝试 JSON.parse。 */
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

/** 将 OpenAI tool_calls 规范化为内部 AssistantTurn.toolCalls。 */
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

/** 合并流式 tool_call 增量（按 index 追加 arguments 字符串）。 */
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

/** LangChain BaseMessage → OpenAI ChatMessage，供 llm 层调用。 */
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

/** Agent 输入消息 → LangChain BaseMessage 列表。 */
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

/** 由 AssistantTurn 构造 AIMessage（含 tool_calls）。 */
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

/** 构造 ToolMessage，并挂上 status 字段供 SSE 区分 tool_result / tool_error。 */
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

/** 同步完成一轮模型调用（非流式）。 */
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

/**
 * 流式完成一轮模型调用：
 * - 过程中 yield textDelta（token）
 * - 结束时 yield 完整 turn（含合并后的 toolCalls）
 */
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

/** 执行单个工具调用；未知工具或异常时返回 status=error 的 ToolMessage。 */
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

/** 在消息列表前注入系统提示词。 */
function withSystemPrompt(messages: BaseMessage[]): BaseMessage[] {
  return [new SystemMessage({ content: RAG_AGENT_SYSTEM_PROMPT }), ...messages];
}

/** 从 config 读取 thread_id，缺省为 default。 */
function threadIdFromConfig(config?: AgentConfig): string {
  return config?.configurable?.thread_id || 'default';
}

/**
 * 过滤掉与系统提示词完全相同的 system 消息，避免把提示词重复写入 checkpointer。
 */
function persistableMessages(messages: BaseMessage[]): BaseMessage[] {
  return messages.filter(
    (message) => message._getType() !== 'system' || toText(message.content) !== RAG_AGENT_SYSTEM_PROMPT,
  );
}

/**
 * RAG Agent：同步 invoke 与流式 stream。
 *
 * ReAct 循环（每轮 iteration）：
 * 1. 调用模型得到 AssistantTurn
 * 2. 若无 tool_calls → 结束循环（最终回答）
 * 3. 若有 tool_calls → 逐个执行工具，把 ToolMessage 追加进上下文，继续下一轮
 */
export class RagAgent {
  /** 同步执行 ReAct，返回完整消息列表。 */
  async invoke(input: AgentInvokeInput, config?: AgentConfig): Promise<{ messages: BaseMessage[] }> {
    const checkpointer = getCheckpointer();
    const threadId = threadIdFromConfig(config);
    const incoming = toBaseMessages(input.messages);
    // 历史记忆 + 本轮输入 + 系统提示
    let messages = withSystemPrompt([...checkpointer.get(threadId), ...incoming]);

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration += 1) {
      const turn = await completeChat(messages);
      const aiMessage = createAiMessage(turn);
      messages = [...messages, aiMessage];
      // 无工具调用：模型已给出最终回答
      if (turn.toolCalls.length === 0) {
        break;
      }
      // 执行全部工具，结果写回对话上下文
      const toolMessages: ToolMessage[] = [];
      for (const toolCall of turn.toolCalls) {
        toolMessages.push(await executeToolCall(toolCall));
      }
      messages = [...messages, ...toolMessages];
    }

    checkpointer.set(threadId, persistableMessages(messages));
    return { messages };
  }

  /**
   * 流式执行 ReAct。
   * @param _streamMode 兼容签名（如 ['updates','messages']），当前实现始终产出两类事件
   */
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
      // 流式模型 token → messages 事件
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
      // 模型节点更新（含 tool_calls）→ updates 事件，供 SSE tool_call
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

      // 工具执行结果 → updates 事件，供 SSE tool_result / tool_error
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

/** 构建并缓存 RAG Agent 单例。 */
export function getRagAgent(): RagAgent {
  if (cachedAgent == null) {
    cachedAgent = new RagAgent();
  }
  return cachedAgent;
}
