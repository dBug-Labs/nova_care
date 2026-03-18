import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sentiment?: {
    mood_score?: number;
    crisis_detected?: boolean;
    health_flags?: string[];
  };
}

interface ChatState {
  messages: Message[];
  sessionId: string | null;
  streaming: boolean;
  streamingContent: string;
  addMessage: (msg: Message) => void;
  setSessionId: (id: string) => void;
  setStreaming: (v: boolean) => void;
  appendStreamToken: (token: string) => void;
  commitStreamedMessage: () => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  streaming: false,
  streamingContent: '',

  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),
  setSessionId: (id) => set({ sessionId: id }),
  setStreaming: (v) => set({ streaming: v, streamingContent: v ? '' : get().streamingContent }),
  appendStreamToken: (token) => set(s => ({ streamingContent: s.streamingContent + token })),
  commitStreamedMessage: () => {
    const content = get().streamingContent;
    if (!content) return;
    set(s => ({
      messages: [...s.messages, {
        id: Date.now().toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
      }],
      streaming: false,
      streamingContent: '',
    }));
  },
  clearChat: () => set({ messages: [], sessionId: null }),
}));
