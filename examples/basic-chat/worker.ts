/**
 * Verani Basic Chat — Minimal web-based chat example
 *
 * Run:
 *   cd examples/basic-chat && wrangler dev
 *
 * Open http://localhost:8787 in two browser tabs to chat.
 */

import { defineConnection, createConnectionHandler } from "../../src/actor/connection-actor";
import { createRoomHandler } from "../../src/actor/room-actor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMeta {
	userId: string;
	clientId: string;
	channels: string[];
	username: string;
}

// ---------------------------------------------------------------------------
// Connection Handler
// ---------------------------------------------------------------------------

const chat = defineConnection<ChatMeta>({
	name: "UserConnection",
	websocketPath: "/ws",
	rooms: { chat: "ChatRoom" },
	connectionBinding: "UserConnection",

	extractMeta(req) {
		const url = new URL(req.url);
		const username = url.searchParams.get("username") ?? `anon-${crypto.randomUUID().slice(0, 6)}`;
		return {
			userId: username,
			clientId: crypto.randomUUID(),
			channels: ["default"],
			username,
		};
	},

	async onConnect(ctx) {
		await ctx.actor.joinRoom("chat", { username: ctx.meta.username });

		ctx.emit.emit("welcome", {
			userId: ctx.meta.userId,
			username: ctx.meta.username,
		});

		await ctx.emit.toRoom("chat").emit("user:joined", {
			username: ctx.meta.username,
			timestamp: Date.now(),
		});
	},

	async onDisconnect(ctx) {
		await ctx.emit.toRoom("chat").emit("user:left", {
			username: ctx.meta.username,
			timestamp: Date.now(),
		});
	},
});

chat.on<{ text: string }>("message", async (ctx, data) => {
	if (!data.text || typeof data.text !== "string") return;

	const text = data.text.trim().slice(0, 500);
	if (!text) return;

	await ctx.emit.toRoom("chat").emit("message", {
		username: ctx.meta.username,
		text,
		timestamp: Date.now(),
	});
});

chat.on("typing", async (ctx) => {
	await ctx.emit.toRoom("chat", { exceptUserId: ctx.meta.userId }).emit("typing", {
		username: ctx.meta.username,
	});
});

export const UserConnection = createConnectionHandler(chat);

// ---------------------------------------------------------------------------
// Room Handler
// ---------------------------------------------------------------------------

export const ChatRoom = createRoomHandler({
	name: "ChatRoom",
	connectionBinding: "UserConnection",
});

// ---------------------------------------------------------------------------
// Worker Fetch Handler — serves the HTML chat UI
// ---------------------------------------------------------------------------

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/ws") {
			const username = url.searchParams.get("username") ?? "anonymous";
			return UserConnection.get(username).fetch(request);
		}

		if (url.pathname === "/" || url.pathname === "/index.html") {
			return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
		}

		return new Response("Not Found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Inline HTML — self-contained chat UI
// ---------------------------------------------------------------------------

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verani Chat</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0a;
    --surface: #141414;
    --border: #262626;
    --text: #e5e5e5;
    --text-muted: #737373;
    --accent: #3b82f6;
    --accent-hover: #2563eb;
    --success: #22c55e;
    --warning: #eab308;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface);
  }

  header h1 {
    font-size: 16px;
    font-weight: 600;
  }

  #status {
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
  }

  #status .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warning);
  }

  #status.connected .dot { background: var(--success); }

  /* Login screen */
  #login {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #login form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 320px;
    padding: 24px;
  }

  #login h2 {
    font-size: 20px;
    font-weight: 600;
    text-align: center;
    margin-bottom: 8px;
  }

  #login p {
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
  }

  input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus { border-color: var(--accent); }

  button {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  button:hover { background: var(--accent-hover); }

  /* Chat screen */
  #chat { display: none; flex-direction: column; flex: 1; min-height: 0; }
  #chat.active { display: flex; }

  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .msg {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.4;
    word-break: break-word;
  }

  .msg .author {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 2px;
  }

  .msg.own { align-self: flex-end; background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
  .msg.own .author { display: none; }
  .msg.other { align-self: flex-start; background: var(--surface); border-bottom-left-radius: 4px; }

  .msg.system {
    align-self: center;
    background: none;
    color: var(--text-muted);
    font-size: 12px;
    padding: 4px 0;
  }

  #typing-indicator {
    padding: 0 16px 4px;
    font-size: 12px;
    color: var(--text-muted);
    height: 20px;
  }

  #composer {
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 8px;
    background: var(--surface);
  }

  #composer input {
    flex: 1;
    background: var(--bg);
  }

  #composer button {
    padding: 10px 20px;
  }
</style>
</head>
<body>
  <header>
    <h1>Verani Chat</h1>
    <div id="status"><span class="dot"></span><span id="status-text">Connecting&hellip;</span></div>
  </header>

  <div id="login">
    <form id="login-form">
      <h2>Join Chat</h2>
      <p>Pick a username to start chatting</p>
      <input id="username-input" type="text" placeholder="Username" autocomplete="off" maxlength="24" autofocus>
      <button type="submit">Join</button>
    </form>
  </div>

  <div id="chat">
    <div id="messages"></div>
    <div id="typing-indicator"></div>
    <div id="composer">
      <input id="msg-input" type="text" placeholder="Type a message&hellip;" autocomplete="off" maxlength="500">
      <button id="send-btn" type="button">Send</button>
    </div>
  </div>

<script>
// -----------------------------------------------------------------------
// Minimal Verani protocol helpers (no SDK needed for basic usage)
// -----------------------------------------------------------------------

/** Send an event to the server */
function verani_emit(ws, type, data) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: type, data: data }));
}

/** Parse a server frame into { event, data } */
function verani_parse(raw) {
  var frame = JSON.parse(raw);
  if (frame.type === "event" && frame.data && frame.data.type) {
    return { event: frame.data.type, data: frame.data };
  }
  return { event: frame.type, data: frame.data || frame };
}

// -----------------------------------------------------------------------
// Chat app
// -----------------------------------------------------------------------

var $ = function(s) { return document.querySelector(s); };
var messages = $("#messages");
var ws = null;
var myUsername = "";
var typingTimeout = null;

function addMessage(html, cls) {
  var el = document.createElement("div");
  el.className = "msg " + (cls || "");
  el.innerHTML = html;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

function setStatus(text, connected) {
  $("#status-text").textContent = text;
  $("#status").className = connected ? "connected" : "";
}

function escapeHtml(s) {
  var d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

$("#login-form").addEventListener("submit", function(e) {
  e.preventDefault();
  var name = $("#username-input").value.trim();
  if (!name) return;
  myUsername = name;
  connect(name);
});

function connect(username) {
  $("#login").style.display = "none";
  $("#chat").classList.add("active");

  var proto = location.protocol === "https:" ? "wss:" : "ws:";
  var url = proto + "//" + location.host + "/ws?username=" + encodeURIComponent(username);

  ws = new WebSocket(url);
  setStatus("Connecting\\u2026");

  ws.onopen = function() { setStatus("Connected", true); };
  ws.onclose = function() { setStatus("Disconnected"); };

  ws.onmessage = function(ev) {
    var msg = verani_parse(ev.data);

    switch (msg.event) {
      case "welcome":
        addMessage("Welcome! You joined as <strong>" + escapeHtml(msg.data.username) + "</strong>", "system");
        break;
      case "message":
        var own = msg.data.username === myUsername;
        var author = own ? "" : '<div class="author">' + escapeHtml(msg.data.username) + "</div>";
        addMessage(author + escapeHtml(msg.data.text), own ? "own" : "other");
        break;
      case "user:joined":
        addMessage(escapeHtml(msg.data.username) + " joined", "system");
        break;
      case "user:left":
        addMessage(escapeHtml(msg.data.username) + " left", "system");
        break;
      case "typing":
        if (msg.data.username === myUsername) return;
        $("#typing-indicator").textContent = msg.data.username + " is typing\\u2026";
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(function() { $("#typing-indicator").textContent = ""; }, 2000);
        break;
    }
  };

  var input = $("#msg-input");

  function send() {
    var text = input.value.trim();
    if (!text || !ws) return;
    verani_emit(ws, "message", { text: text });
    input.value = "";
    input.focus();
  }

  $("#send-btn").addEventListener("click", send);
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") { send(); return; }
    if (ws) verani_emit(ws, "typing", {});
  });

  input.focus();
}
</script>
</body>
</html>`;
