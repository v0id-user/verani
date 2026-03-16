import { useState, useEffect, useRef, useCallback } from "react";
import { VeraniClient } from "verani/client";

interface Message {
	id: string;
	type: "chat" | "system";
	username?: string;
	text: string;
	timestamp: number;
}

export function ChatRoom({ username }: { username: string }) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [connected, setConnected] = useState(false);
	const [typingUser, setTypingUser] = useState("");
	const clientRef = useRef<VeraniClient | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const typingTimerRef = useRef<ReturnType<typeof setTimeout>>();

	const addMessage = useCallback((msg: Message) => {
		setMessages((prev) => [...prev, msg]);
	}, []);

	useEffect(() => {
		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		const url = `${proto}//${window.location.host}/ws?username=${encodeURIComponent(username)}`;

		const client = new VeraniClient(url, {
			reconnection: { enabled: true, maxAttempts: 10, initialDelay: 500 },
		});
		clientRef.current = client;

		client.onOpen(() => setConnected(true));
		client.onClose(() => setConnected(false));
		client.onStateChange((s) => {
			if (s === "connected") setConnected(true);
			if (s === "disconnected") setConnected(false);
		});

		client.on<{ username: string }>("welcome", (data) => {
			addMessage({
				id: crypto.randomUUID(),
				type: "system",
				text: `Welcome, ${data.username}!`,
				timestamp: Date.now(),
			});
		});

		client.on<{ username: string; text: string; timestamp: number }>("message", (data) => {
			addMessage({
				id: crypto.randomUUID(),
				type: "chat",
				username: data.username,
				text: data.text,
				timestamp: data.timestamp,
			});
		});

		client.on<{ username: string; timestamp: number }>("user:joined", (data) => {
			addMessage({
				id: crypto.randomUUID(),
				type: "system",
				text: `${data.username} joined`,
				timestamp: data.timestamp,
			});
		});

		client.on<{ username: string; timestamp: number }>("user:left", (data) => {
			addMessage({
				id: crypto.randomUUID(),
				type: "system",
				text: `${data.username} left`,
				timestamp: data.timestamp,
			});
		});

		client.on<{ username: string }>("typing", (data) => {
			if (data.username === username) return;
			setTypingUser(data.username);
			clearTimeout(typingTimerRef.current);
			typingTimerRef.current = setTimeout(() => setTypingUser(""), 2000);
		});

		return () => {
			client.close();
			clientRef.current = null;
		};
	}, [username, addMessage]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	function send() {
		const text = input.trim();
		if (!text || !clientRef.current) return;
		clientRef.current.emit("message", { text });
		setInput("");
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Enter") {
			send();
			return;
		}
		clientRef.current?.emit("typing", {});
	}

	return (
		<div style={styles.container}>
			<div style={styles.header}>
				<span style={styles.title}>Verani + TanStack Chat</span>
				<span style={styles.status}>
					<span
						style={{
							...styles.dot,
							background: connected ? "var(--success)" : "var(--text-muted)",
						}}
					/>
					{connected ? "Connected" : "Connecting\u2026"}
				</span>
			</div>

			<div style={styles.messages}>
				{messages.map((msg) =>
					msg.type === "system" ? (
						<div key={msg.id} style={styles.systemMsg}>
							{msg.text}
						</div>
					) : (
						<div
							key={msg.id}
							style={{
								...styles.chatMsg,
								...(msg.username === username ? styles.ownMsg : styles.otherMsg),
							}}
						>
							{msg.username !== username && (
								<div style={styles.author}>{msg.username}</div>
							)}
							<div>{msg.text}</div>
						</div>
					)
				)}
				<div ref={messagesEndRef} />
			</div>

			{typingUser && (
				<div style={styles.typing}>{typingUser} is typing&hellip;</div>
			)}

			<div style={styles.composer}>
				<input
					style={styles.input}
					type="text"
					placeholder="Type a message\u2026"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					maxLength={500}
					autoFocus
				/>
				<button style={styles.sendBtn} onClick={send}>
					Send
				</button>
			</div>
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	container: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
	header: {
		padding: "12px 16px",
		borderBottom: "1px solid var(--border)",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		background: "var(--surface)",
	},
	title: { fontSize: 16, fontWeight: 600 },
	status: { fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)" },
	dot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
	messages: { flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 4 },
	chatMsg: { maxWidth: "85%", padding: "8px 12px", borderRadius: 12, fontSize: 14, lineHeight: 1.4, wordBreak: "break-word" },
	ownMsg: { alignSelf: "flex-end", background: "var(--accent)", color: "#fff", borderBottomRightRadius: 4 },
	otherMsg: { alignSelf: "flex-start", background: "var(--surface)", borderBottomLeftRadius: 4 },
	author: { fontSize: 11, fontWeight: 600, color: "var(--accent)", marginBottom: 2 },
	systemMsg: { alignSelf: "center", color: "var(--text-muted)", fontSize: 12, padding: "4px 0" },
	typing: { padding: "0 16px 4px", fontSize: 12, color: "var(--text-muted)" },
	composer: { padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, background: "var(--surface)" },
	input: {
		flex: 1,
		background: "var(--bg)",
		border: "1px solid var(--border)",
		borderRadius: 8,
		padding: "10px 14px",
		color: "var(--text)",
		fontSize: 14,
		outline: "none",
	},
	sendBtn: {
		background: "var(--accent)",
		color: "#fff",
		border: "none",
		borderRadius: 8,
		padding: "10px 20px",
		fontSize: 14,
		fontWeight: 500,
		cursor: "pointer",
	},
};
