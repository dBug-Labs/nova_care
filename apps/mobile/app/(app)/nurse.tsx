import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { Colors } from '../../constants/colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function NurseScreen() {
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);
  const {
    messages, sessionId, streaming, streamingContent,
    addMessage, setSessionId, setStreaming, appendStreamToken, commitStreamedMessage
  } = useChatStore();
  const profile = useAuthStore(s => s.profile);

  const name = profile?.full_name?.split(' ')[0] || 'there';

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, streamingContent]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    addMessage({ id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() });
    setStreaming(true);

    try {
      const { data: { session } } = await import('../../lib/supabase').then(m => m.supabase.auth.getSession());
      const token = session?.access_token;

      const response = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (true) {
        if (!reader) break;
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) appendStreamToken(data.token);
            if (data.session_id && !sessionId) setSessionId(data.session_id);
            if (data.done) commitStreamedMessage();
            if (data.error) { setStreaming(false); Alert.alert('Error', data.error); }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: any) {
      setStreaming(false);
      Alert.alert('Connection Error', 'Could not reach Nova. Please check your connection.');
    }
  };

  const quickPrompts = [
    "How am I doing today?", "I forgot my medicine", "I have a headache", "Check my health"
  ];

  const renderMessage = ({ item }: { item: any }) => (
    <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
      {item.role === 'assistant' && (
        <View style={styles.avatarRow}>
          <View style={styles.avatar}><Text style={styles.avatarText}>N</Text></View>
          <Text style={styles.senderName}>Nova</Text>
        </View>
      )}
      <Text style={[styles.bubbleText, item.role === 'user' && styles.userBubbleText]}>
        {item.content}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.novaAvatar}><Text style={styles.novaAvatarText}>N</Text></View>
          <View>
            <Text style={styles.headerTitle}>Nova</Text>
            <Text style={styles.headerSub}>Your AI Health Companion</Text>
          </View>
        </View>
        <View style={styles.onlineDot} />
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyGreeting}>Hello, {name} 🌿</Text>
            <Text style={styles.emptyText}>I'm Nova, your personal health companion. How are you feeling today?</Text>
            <View style={styles.quickPromptGrid}>
              {quickPrompts.map(p => (
                <TouchableOpacity key={p} style={styles.quickPrompt} onPress={() => { setInput(p); }}>
                  <Text style={styles.quickPromptText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
      />

      {/* Streaming bubble */}
      {streaming && streamingContent && (
        <View style={[styles.bubble, styles.assistantBubble, styles.streamingBubble]}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>N</Text></View>
            <Text style={styles.senderName}>Nova</Text>
          </View>
          <Text style={styles.bubbleText}>{streamingContent}<Text style={styles.cursor}>▌</Text></Text>
        </View>
      )}
      {streaming && !streamingContent && (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask Nova anything about your health..."
          placeholderTextColor={Colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || streaming) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || streaming}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.disclaimer}>Nova provides health guidance only — not medical advice.</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 52, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  novaAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  novaAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textMuted },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.success },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: { marginBottom: 14, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderRadius: 18, borderBottomRightRadius: 4, padding: 14 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: Colors.card, borderRadius: 18, borderBottomLeftRadius: 4, padding: 14, borderWidth: 1, borderColor: Colors.border },
  streamingBubble: { opacity: 0.95 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  senderName: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  bubbleText: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  userBubbleText: { color: '#fff' },
  cursor: { color: Colors.primary, fontWeight: '700' },
  emptyState: { paddingTop: 48, alignItems: 'center', paddingHorizontal: 20 },
  emptyGreeting: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  quickPromptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  quickPrompt: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  quickPromptText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
  inputRow: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: 8, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: Colors.background, borderRadius: 22, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: Colors.text, maxHeight: 120 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  disclaimer: { fontSize: 9, color: Colors.textMuted, textAlign: 'center', paddingBottom: 8 },
});
