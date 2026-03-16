import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChatRoom } from "../components/ChatRoom";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	const [username, setUsername] = useState("");
	const [joined, setJoined] = useState(false);

	if (joined) {
		return <ChatRoom username={username} />;
	}

	return (
		<div style={styles.login}>
			<form
				style={styles.form}
				onSubmit={(e) => {
					e.preventDefault();
					const name = username.trim();
					if (name) setJoined(true);
				}}
			>
				<h2 style={styles.heading}>Verani + TanStack Chat</h2>
				<p style={styles.sub}>Real-time chat powered by Cloudflare Actors</p>
				<input
					style={styles.input}
					type="text"
					placeholder="Pick a username"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					maxLength={24}
					autoFocus
				/>
				<button style={styles.btn} type="submit">
					Join Chat
				</button>
			</form>
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	login: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
	form: { display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320, padding: 24 },
	heading: { fontSize: 20, fontWeight: 600, textAlign: "center" },
	sub: { fontSize: 13, color: "var(--text-muted)", textAlign: "center", marginBottom: 8 },
	input: {
		background: "var(--surface)",
		border: "1px solid var(--border)",
		borderRadius: 8,
		padding: "10px 14px",
		color: "var(--text)",
		fontSize: 14,
		outline: "none",
	},
	btn: {
		background: "var(--accent)",
		color: "#fff",
		border: "none",
		borderRadius: 8,
		padding: "10px 16px",
		fontSize: 14,
		fontWeight: 500,
		cursor: "pointer",
	},
};
