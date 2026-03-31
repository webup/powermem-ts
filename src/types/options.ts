import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface InitOptions {
  /** powermem 家目录，默认 ~/.powermem/ */
  homeDir?: string;
  /** 指定 Python 可执行文件路径，默认 python3 → python */
  pythonPath?: string;
  /** 要安装的 powermem 版本，默认 'powermem'（最新版） */
  powermemVersion?: string;
  /** pip install 额外参数 */
  pipArgs?: string[];
  /** 是否输出日志，默认 true */
  verbose?: boolean;
}

export interface MemoryOptions {
  /** 直连已有 server，跳过自动启动（使用 HttpProvider） */
  serverUrl?: string;
  /** API Key（仅 HttpProvider 模式） */
  apiKey?: string;
  /** .env 文件路径，默认 '.env' */
  envFile?: string;
  /** 内部 server 监听端口，默认 19527（仅 HttpProvider 模式） */
  port?: number;
  /** 等待 server 就绪的超时时间(ms)，默认 30000（仅 HttpProvider 模式） */
  startupTimeout?: number;
  /** init 相关选项，透传给 Memory.init()（仅 HttpProvider 模式） */
  init?: InitOptions;

  /** LangChain Embeddings 实例（NativeProvider 模式，不传则从环境变量自动创建） */
  embeddings?: Embeddings;
  /** LangChain LLM 实例（NativeProvider 模式，用于 infer 功能，不传则从环境变量自动创建） */
  llm?: BaseChatModel;
  /** SQLite 数据库文件路径，默认 ~/.powermem/memories.db */
  dbPath?: string;
}
