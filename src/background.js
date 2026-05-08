const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const MAX_PAGE_CHARS = 12000;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_HISTORY_MESSAGES = 12;
const HISTORY_STORAGE_PREFIX = "hist:";
const conversationByTabId = new Map();
const urlByTabId = new Map();

function getStorageValue(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([key], (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result[key]);
    });
  });
}

function withTimeoutFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0 || !tabs[0].id) {
    throw new Error("Could not find an active tab.");
  }
  return tabs[0];
}

async function extractPageContext(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const text = document.body?.innerText || "";
      return {
        title: document.title || "",
        url: window.location.href || "",
        text
      };
    }
  });

  return result;
}

function buildPrompt(actionType, pageContext, question) {
  const normalizedText = (pageContext.text || "").slice(0, MAX_PAGE_CHARS);
  const instruction =
    actionType === "SUMMARIZE"
      ? "Provide a concise summary of the page in bullet points."
      : `Answer the user's question using only the page context when possible.\nQuestion: ${question}`;

  return [
    "You are a page assistant.",
    instruction,
    "If the page lacks enough context, clearly say so.",
    `Page title: ${pageContext.title || "(untitled)"}`,
    `Page URL: ${pageContext.url || "(unknown url)"}`,
    "Page content:",
    normalizedText
  ].join("\n\n");
}

function buildChatMessages(actionType, pageContext, question, conversationHistory) {
  if (actionType === "SUMMARIZE") {
    return [
      {
        role: "user",
        content: buildPrompt(actionType, pageContext, question)
      }
    ];
  }

  const pageText = (pageContext.text || "").slice(0, MAX_PAGE_CHARS);
  const systemPrompt = [
    "You are a page assistant in a chatbot conversation.",
    "Answer based on the current page context first, then prior chat turns.",
    "If the page does not contain enough information, say what is missing.",
    `Page title: ${pageContext.title || "(untitled)"}`,
    `Page URL: ${pageContext.url || "(unknown url)"}`,
    "Page content:",
    pageText
  ].join("\n\n");

  const trimmedHistory = (conversationHistory || []).slice(-MAX_HISTORY_MESSAGES);
  return [
    {
      role: "system",
      content: systemPrompt
    },
    ...trimmedHistory,
    {
      role: "user",
      content: question
    }
  ];
}

async function callOpenRouter({ apiKey, model, messages }) {
  const response = await withTimeoutFetch(
    OPENROUTER_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "chrome-extension://summarize-anything",
        "X-Title": "Summarize Anything"
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages,
        temperature: 0.2
      })
    },
    REQUEST_TIMEOUT_MS
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage =
      payload?.error?.message ||
      `OpenRouter request failed with status ${response.status}.`;
    throw new Error(apiMessage);
  }

  const answer = payload?.choices?.[0]?.message?.content;
  if (!answer) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return answer;
}

function historyKey(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return HISTORY_STORAGE_PREFIX + u.toString();
  } catch {
    return HISTORY_STORAGE_PREFIX + url;
  }
}

function loadUrlHistory(url) {
  const key = historyKey(url);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (r) => resolve(r[key] || []));
  });
}

function saveUrlHistory(url, messages) {
  const key = historyKey(url);
  const limited = messages.slice(-MAX_HISTORY_MESSAGES);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: limited }, resolve);
  });
}

function clearUrlHistory(url) {
  const key = historyKey(url);
  return new Promise((resolve) => {
    chrome.storage.local.remove([key], resolve);
  });
}

function getConversation(tabId) {
  return conversationByTabId.get(tabId) || [];
}

function setConversation(tabId, messages) {
  conversationByTabId.set(tabId, messages.slice(-MAX_HISTORY_MESSAGES));
}

async function runPageAssistant(actionType, question, model) {
  const apiKey = await getStorageValue("openrouterApiKey");
  if (!apiKey) {
    throw new Error("OpenRouter API key is missing. Save it in popup or side panel.");
  }

  const tab = await getActiveTab();
  const pageContext = await extractPageContext(tab.id);
  if (!pageContext?.text || pageContext.text.trim().length === 0) {
    throw new Error("Could not extract text from the current page.");
  }

  urlByTabId.set(tab.id, tab.url);

  const existingConversation = conversationByTabId.has(tab.id)
    ? getConversation(tab.id)
    : await loadUrlHistory(tab.url);

  if (!conversationByTabId.has(tab.id)) {
    conversationByTabId.set(tab.id, existingConversation);
  }

  const messages = buildChatMessages(
    actionType,
    pageContext,
    question,
    existingConversation
  );
  const result = await callOpenRouter({ apiKey, model, messages });

  if (actionType === "ASK") {
    const updatedConversation = [
      ...existingConversation,
      { role: "user", content: question },
      { role: "assistant", content: result }
    ];
    setConversation(tab.id, updatedConversation);
    await saveUrlHistory(tab.url, updatedConversation);
  }

  return { result, pageContext };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const url = urlByTabId.get(tabId);
  conversationByTabId.delete(tabId);
  urlByTabId.delete(tabId);
  if (url) {
    clearUrlHistory(url);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "RESET_CHAT") {
    getActiveTab()
      .then(async (tab) => {
        conversationByTabId.delete(tab.id);
        await clearUrlHistory(tab.url);
        sendResponse({ ok: true });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not reset chat."
        });
      });
    return true;
  }

  if (message?.type === "GET_HISTORY") {
    getActiveTab()
      .then(async (tab) => {
        const history = await loadUrlHistory(tab.url);
        if (!conversationByTabId.has(tab.id) && history.length > 0) {
          conversationByTabId.set(tab.id, history);
        }
        sendResponse({ ok: true, data: { history } });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Could not load history."
        });
      });
    return true;
  }

  if (message?.type !== "SUMMARIZE" && message?.type !== "ASK") {
    return;
  }

  runPageAssistant(message.type, message.question || "", message.model || DEFAULT_MODEL)
    .then(({ result, pageContext }) => {
      sendResponse({
        ok: true,
        data: {
          output: result,
          title: pageContext.title,
          url: pageContext.url
        }
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error."
      });
    });

  return true;
});
