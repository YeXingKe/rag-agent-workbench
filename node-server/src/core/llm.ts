/**
 * DashScope 兼容 Chat Completions 客户端
 *
 * 走 OpenAI 形状的 /v1/chat/completions；供 Agent ReAct 使用。
 */
import { getSettings } from '../config/settings.js'; // 读模型名与 API Key

const CHAT_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'; // 兼容模式聊天地址

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'; // 四种角色

/** OpenAI 兼容的 tool_call 结构 */
export interface ChatToolCall {
  id: string; // 工具调用 id，回传 ToolMessage 时要用
  type?: string; // 一般是 function
  index?: number; // 流式场景下的序号
  function?: { // 被调用的函数
    name?: string; // 如 search_knowledge_base
    arguments?: string; // JSON 字符串参数
  };
}

/** 单条对话消息 */
export interface ChatMessage {
  role: ChatRole; // 角色
  content: string | null; // 正文；tool 调用时 assistant 可能为 null
  name?: string; // 可选名字
  tool_call_id?: string; // tool 角色回传时对应的调用 id
  tool_calls?: ChatToolCall[]; // assistant 发起的工具调用列表
}

export interface ChatOptions {
  streaming?: boolean; // 是否流式
  temperature?: number; // 随机度，默认 0.1
  model?: string; // 覆盖配置里的 MODEL
  tools?: unknown[]; // function calling 工具定义
}

/** 非流式一次完整回复 */
export interface ChatCompletionResult {
  content: string; // 回答文本
  tool_calls: ChatToolCall[]; // 若模型要调工具
  finish_reason: string | null; // stop / tool_calls 等
}

/** 流式增量片段 */
export interface ChatStreamDelta {
  content?: string; // 本帧新增的字
  tool_calls?: ChatToolCall[]; // 本帧工具调用增量
  finish_reason?: string | null; // 结束原因
}

interface ChatCompletionResponse {
  choices?: Array<{ // 候选列表，一般只用第 0 个
    message?: { // 非流式完整 message
      content?: string | null; // 文本
      tool_calls?: ChatToolCall[]; // 工具
    };
    delta?: { // 流式增量
      content?: string | null; // 文本增量
      tool_calls?: ChatToolCall[]; // 工具增量
    };
    finish_reason?: string | null; // 结束原因
  }>;
  error?: { message?: string; code?: string }; // 业务错误
}

/**
 * 向 DashScope 发起 chat completions 请求。
 *
 * @param stream true=SSE；false=一份 JSON
 */
async function postChat(
  messages: ChatMessage[],
  options: ChatOptions,
  stream: boolean,
): Promise<Response> {
  const settings = getSettings(); // 读配置
  if (!settings.dashscopeApiKey) { // 没密钥
    throw new Error('DASHSCOPE_API_KEY is not configured'); // 不发请求
  }

  const body: Record<string, unknown> = { // 请求体
    model: options.model ?? settings.model, // 模型 id
    messages, // 对话历史
    temperature: options.temperature ?? 0.1, // 偏低更稳
    stream, // 是否流式
  };
  if (options.tools && options.tools.length > 0) { // 有工具定义
    body.tools = options.tools; // 挂上 function calling
  }

  const response = await fetch(CHAT_URL, { // HTTP POST
    method: 'POST', // 聊天补全
    headers: {
      Authorization: `Bearer ${settings.dashscopeApiKey}`, // Bearer
      'Content-Type': 'application/json', // JSON
    },
    body: JSON.stringify(body), // 序列化
  });

  if (!response.ok) { // 4xx/5xx
    const responseBody = await response.text(); // 读错误正文
    throw new Error(`DashScope chat failed: ${response.status} ${responseBody}`); // 抛给上层
  }

  return response; // 交给调用方解析 JSON 或 SSE
}

/** 非流式 chat completion，返回完整 content / tool_calls。 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatCompletionResult> {
  const response = await postChat(messages, options, false); // 非流式
  const payload = (await response.json()) as ChatCompletionResponse; // 整包 JSON
  if (payload.error) { // 业务错误字段
    throw new Error(`DashScope chat failed: ${payload.error.code ?? ''} ${payload.error.message ?? ''}`.trim());
  }
  const choice = payload.choices?.[0]; // 第一条候选
  return {
    content: choice?.message?.content ?? '', // 没有文本就空串
    tool_calls: choice?.message?.tool_calls ?? [], // 没有工具就空数组
    finish_reason: choice?.finish_reason ?? null, // 结束原因
  };
}

/** 非流式对话，只拿文本 content。 */
export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const result = await chatCompletion(messages, options); // 完整结果
  return result.content; // 只要正文
}

/**
 * 流式 chat completion：解析 SSE `data:` 行并 yield 增量。
 */
export async function* streamChatCompletion(
  messages: ChatMessage[],
  options: ChatOptions = {},
): AsyncGenerator<ChatStreamDelta, void, unknown> {
  const response = await postChat(messages, options, true); // 打开 SSE
  if (!response.body) { // 没有可读流
    throw new Error('DashScope chat stream returned an empty body');
  }

  const reader = response.body.getReader(); // 按块读
  const decoder = new TextDecoder(); // 字节 → 字符串
  let buffer = ''; // 粘包缓冲：一行可能被拆到两次 read

  while (true) { // 直到流结束
    const { done, value } = await reader.read(); // 下一块
    if (done) { // 对端关流
      break; // 退出循环
    }
    buffer += decoder.decode(value, { stream: true }); // 拼到缓冲
    const lines = buffer.split('\n'); // 按行切开
    buffer = lines.pop() ?? ''; // 最后一段可能不完整，留到下次

    for (const line of lines) { // 处理完整行
      const trimmed = line.trim(); // 去空白
      if (!trimmed.startsWith('data:')) { // SSE 事件才处理
        continue; // 跳过空行/注释
      }
      const data = trimmed.slice('data:'.length).trim(); // 去掉 data: 前缀
      if (!data || data === '[DONE]') { // 空数据或结束标记
        if (data === '[DONE]') { // 官方结束信号
          return; // 结束生成器
        }
        continue; // 空 data 跳过
      }
      const payload = JSON.parse(data) as ChatCompletionResponse; // 一帧 JSON
      const choice = payload.choices?.[0]; // 第一条
      const delta = choice?.delta; // 增量字段
      yield { // 交给上层拼 token / 工具
        content: delta?.content ?? undefined, // 文本增量
        tool_calls: delta?.tool_calls, // 工具增量
        finish_reason: choice?.finish_reason ?? null, // 结束原因
      };
    }
  }
}

/** 流式对话，只 yield 文本增量。 */
export async function* streamChat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  for await (const delta of streamChatCompletion(messages, options)) { // 复用完整流
    if (delta.content) { // 本帧有字
      yield delta.content; // 只往外吐文本
    }
  }
}

/**
 * 构造 LLM 调用门面（固定 temperature 等选项）。
 */
export function getLlm(options: ChatOptions = {}) {
  const temperature = options.temperature ?? 0.1; // 默认偏低更稳
  return {
    streaming: options.streaming ?? false, // 是否默认流式（标记用）
    temperature, // 暴露给调用方
    async invoke(messages: ChatMessage[]): Promise<string> { // 非流式只要文本
      return chat(messages, { ...options, temperature });
    },
    stream(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> { // 流式只要文本
      return streamChat(messages, { ...options, temperature, streaming: true });
    },
    async complete(messages: ChatMessage[]): Promise<ChatCompletionResult> { // 非流式完整结果
      return chatCompletion(messages, { ...options, temperature });
    },
    streamCompletion(messages: ChatMessage[]): AsyncGenerator<ChatStreamDelta, void, unknown> { // 流式含工具
      return streamChatCompletion(messages, { ...options, temperature, streaming: true });
    },
  };
}
