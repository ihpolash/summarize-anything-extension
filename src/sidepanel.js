const summarizeButton = document.getElementById("summarizeButton");
const clearChatButton = document.getElementById("clearChatButton");
const newChatButton = document.getElementById("newChatButton");
const askButton = document.getElementById("askButton");
const saveKeyButton = document.getElementById("saveKeyButton");
const apiKeyInput = document.getElementById("apiKeyInput");
const questionInput = document.getElementById("questionInput");
const settingsToggle = document.getElementById("settingsToggle");
const settingsDrawer = document.getElementById("settingsDrawer");
const messagesArea = document.getElementById("messagesArea");
const emptyState = document.getElementById("emptyState");

const MODEL_OPTIONS = [
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "tencent/hy3-preview:free",
  "google/gemma-4-26b-a4b-it:free",
  "minimax/minimax-m2.5:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
];

const MODEL_DISPLAY_NAMES = {
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": "Nvidia Nemotron",
  "tencent/hy3-preview:free": "Tencent HY3",
  "google/gemma-4-26b-a4b-it:free": "Gemma 4",
  "minimax/minimax-m2.5:free": "MiniMax M2",
  "qwen/qwen3-next-80b-a3b-instruct:free": "Qwen3",
};

// ─── Toast ───────────────────────────────────────────────

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || ""}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  const dismiss = () => {
    toast.classList.add("dismissing");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  const timer = setTimeout(dismiss, 3000);
  toast.addEventListener("click", () => {
    clearTimeout(timer);
    dismiss();
  });
}

// ─── Markdown Renderer ───────────────────────────────────

function renderMarkdown(rawText) {
  let text = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  text = text.replace(/^#{1,3}\s+(.+)$/gm, "<h3>$1</h3>");
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  const lines = text.split("\n");
  const output = [];
  let inUl = false;
  let inOl = false;

  for (const line of lines) {
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    const olMatch = line.match(/^\d+\.\s+(.+)$/);

    if (ulMatch) {
      if (inOl) { output.push("</ol>"); inOl = false; }
      if (!inUl) { output.push("<ul>"); inUl = true; }
      output.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (inUl) { output.push("</ul>"); inUl = false; }
      if (!inOl) { output.push("<ol>"); inOl = true; }
      output.push(`<li>${olMatch[1]}</li>`);
    } else {
      if (inUl) { output.push("</ul>"); inUl = false; }
      if (inOl) { output.push("</ol>"); inOl = false; }
      output.push(line);
    }
  }
  if (inUl) output.push("</ul>");
  if (inOl) output.push("</ol>");

  text = output.join("\n");

  const blocks = text.split(/\n{2,}/);
  text = blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (/^<(h3|ul|ol|li|blockquote)/.test(trimmed)) return trimmed;
    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).filter(Boolean).join("\n");

  return text;
}

// ─── Helpers ─────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getStorageValue(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([key], (result) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) { reject(new Error(runtimeError.message)); return; }
      resolve(result[key]);
    });
  });
}

function setStorageValue(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [key]: value }, () => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) { reject(new Error(runtimeError.message)); return; }
      resolve();
    });
  });
}

async function ensureCurrentSitePermission() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.url) {
    throw new Error("Could not determine active tab URL.");
  }

  const parsedUrl = new URL(activeTab.url);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("This page type is not supported for content extraction.");
  }

  const originPattern = `${parsedUrl.protocol}//${parsedUrl.host}/*`;
  const hasPermission = await chrome.permissions.contains({
    origins: [originPattern],
  });

  if (hasPermission) {
    return;
  }

  const granted = await chrome.permissions.request({
    origins: [originPattern],
  });
  if (!granted) {
    throw new Error("Site access permission is required to summarize this page.");
  }
}

// ─── Model Chips ─────────────────────────────────────────

function buildModelChips(selectedModel) {
  const container = document.getElementById("modelChips");
  container.innerHTML = "";
  MODEL_OPTIONS.forEach((modelId, i) => {
    const chipId = `chip-panel-${i}`;
    const wrapper = document.createElement("span");
    wrapper.className = "model-chip";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "panel-model";
    input.id = chipId;
    input.value = modelId;
    input.checked = modelId === selectedModel;

    const label = document.createElement("label");
    label.htmlFor = chipId;
    label.textContent = MODEL_DISPLAY_NAMES[modelId] || modelId;

    wrapper.appendChild(input);
    wrapper.appendChild(label);
    container.appendChild(wrapper);
  });
}

function getSelectedModel() {
  const checked = document.querySelector("#modelChips input[type='radio']:checked");
  return checked ? checked.value : MODEL_OPTIONS[0];
}

// ─── Chat Messages ────────────────────────────────────────

function appendMessage(author, text, roleClass) {
  emptyState.style.display = "none";

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${roleClass}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (roleClass === "assistant") {
    bubble.className += " md-content";
    bubble.innerHTML = renderMarkdown(text);

    const meta = document.createElement("div");
    meta.className = "message-meta";
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.dataset.text = text;
    meta.appendChild(copyBtn);

    wrapper.appendChild(bubble);
    wrapper.appendChild(meta);
  } else {
    bubble.textContent = text;
    wrapper.appendChild(bubble);
  }

  messagesArea.appendChild(wrapper);
  messagesArea.scrollTop = messagesArea.scrollHeight;

  return wrapper;
}

function appendLoadingBubble() {
  emptyState.style.display = "none";
  const wrapper = document.createElement("div");
  wrapper.className = "chat-message assistant";
  wrapper.id = "loadingBubble";
  wrapper.innerHTML = `
    <div class="message-bubble">
      <div class="typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>`;
  messagesArea.appendChild(wrapper);
  messagesArea.scrollTop = messagesArea.scrollHeight;
  return wrapper;
}

function removeLoadingBubble() {
  const bubble = document.getElementById("loadingBubble");
  if (bubble) bubble.remove();
}

// ─── Loading State ────────────────────────────────────────

function setLoading(isLoading) {
  summarizeButton.disabled = isLoading;
  clearChatButton.disabled = isLoading;
  newChatButton.disabled = isLoading;
  askButton.disabled = isLoading;
  saveKeyButton.disabled = isLoading;
  document.querySelectorAll("#modelChips input").forEach((input) => {
    input.disabled = isLoading;
  });
}

// ─── Action Runner ────────────────────────────────────────

async function runAction(type) {
  const question = questionInput.value.trim();
  const model = getSelectedModel();

  if (type === "ASK" && !question) {
    showToast("Enter a question first.", "error");
    return;
  }

  if (type === "ASK") {
    appendMessage("You", question, "user");
    questionInput.value = "";
    questionInput.style.height = "auto";
  }

  setLoading(true);
  appendLoadingBubble();

  try {
    await ensureCurrentSitePermission();
    const response = await chrome.runtime.sendMessage({ type, question, model });
    if (!response?.ok) throw new Error(response?.error || "Request failed.");

    removeLoadingBubble();

    if (type === "ASK") {
      appendMessage("Assistant", response.data.output, "assistant");
    } else {
      const msgWrapper = appendMessage("Assistant", response.data.output, "assistant");
      const chip = document.createElement("div");
      chip.className = "source-chip";
      chip.textContent = `📄 ${response.data.title || "Current page"}`;
      msgWrapper.insertBefore(chip, msgWrapper.firstChild);
    }
  } catch (error) {
    removeLoadingBubble();
    const msg = error instanceof Error ? error.message : "Unknown error.";
    const errDiv = document.createElement("div");
    errDiv.className = "error-card";
    errDiv.innerHTML = `<span>⚠️</span><span>${escapeHtml(msg)}</span>`;
    messagesArea.appendChild(errDiv);
    messagesArea.scrollTop = messagesArea.scrollHeight;
    showToast(msg, "error");
  } finally {
    setLoading(false);
  }
}

// ─── Copy Button Delegation ───────────────────────────────

messagesArea.addEventListener("click", (e) => {
  if (e.target.classList.contains("copy-btn")) {
    const text = e.target.dataset.text;
    navigator.clipboard.writeText(text).then(() => {
      e.target.textContent = "Copied!";
      e.target.classList.add("copied");
      setTimeout(() => {
        e.target.textContent = "Copy";
        e.target.classList.remove("copied");
      }, 1500);
    });
  }
});

// ─── Settings Toggle ──────────────────────────────────────

settingsToggle.addEventListener("click", () => {
  const isOpen = settingsDrawer.classList.toggle("open");
  settingsToggle.setAttribute("aria-expanded", String(isOpen));
});

// ─── Textarea Auto-resize + Enter Submit ──────────────────

questionInput.addEventListener("input", () => {
  questionInput.style.height = "auto";
  questionInput.style.height = `${Math.min(questionInput.scrollHeight, 120)}px`;
});

questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    runAction("ASK");
  }
});

// ─── Event Listeners ─────────────────────────────────────

summarizeButton.addEventListener("click", () => runAction("SUMMARIZE"));
askButton.addEventListener("click", () => runAction("ASK"));

async function resetChat() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "RESET_CHAT" });
    if (!response?.ok) throw new Error(response?.error || "Could not reset chat.");
    messagesArea.innerHTML = "";
    messagesArea.appendChild(emptyState);
    emptyState.style.display = "";
    showToast("Chat cleared.", "success");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Unknown error.", "error");
  }
}

newChatButton.addEventListener("click", resetChat);
clearChatButton.addEventListener("click", resetChat);

document.getElementById("modelChips").addEventListener("change", async (e) => {
  if (e.target.type === "radio") {
    try {
      await setStorageValue("selectedModel", e.target.value);
    } catch (_err) {
      showToast("Could not save model selection.", "error");
    }
  }
});

saveKeyButton.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showToast("Enter your API key before saving.", "error");
    return;
  }
  try {
    await setStorageValue("openrouterApiKey", apiKey);
    showToast("API key saved.", "success");
    settingsDrawer.classList.remove("open");
    settingsToggle.setAttribute("aria-expanded", "false");
  } catch (_err) {
    showToast("Could not save API key.", "error");
  }
});

// ─── History Restore ──────────────────────────────────────

async function restorePageHistory() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_HISTORY" });
    if (!response?.ok || !response.data?.history?.length) return;

    for (const msg of response.data.history) {
      if (msg.role === "user") {
        appendMessage("You", msg.content, "user");
      } else if (msg.role === "assistant") {
        appendMessage("Assistant", msg.content, "assistant");
      }
    }
  } catch (_err) {
    // silently fail — history restore is best-effort
  }
}

// ─── Init ─────────────────────────────────────────────────

async function init() {
  try {
    const [savedKey, savedModel] = await Promise.all([
      getStorageValue("openrouterApiKey"),
      getStorageValue("selectedModel"),
    ]);

    const resolvedModel =
      savedModel && MODEL_OPTIONS.includes(savedModel) ? savedModel : MODEL_OPTIONS[0];
    buildModelChips(resolvedModel);

    if (savedKey) {
      apiKeyInput.value = savedKey;
    } else {
      settingsDrawer.classList.add("open");
      settingsToggle.setAttribute("aria-expanded", "true");
    }

    await restorePageHistory();
  } catch (_err) {
    showToast("Could not load settings.", "error");
    buildModelChips(MODEL_OPTIONS[0]);
    settingsDrawer.classList.add("open");
    settingsToggle.setAttribute("aria-expanded", "true");
  }
}

init();
