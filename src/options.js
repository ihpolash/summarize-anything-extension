const apiKeyInput = document.getElementById("apiKeyInput");
const saveButton = document.getElementById("saveButton");
const clearButton = document.getElementById("clearButton");

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const safeMsg = String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  toast.innerHTML = `<span>${icons[type] || ""}</span><span>${safeMsg}</span>`;
  container.appendChild(toast);

  const dismiss = () => {
    toast.classList.add("dismissing");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  const timer = setTimeout(dismiss, 3000);
  toast.addEventListener("click", () => { clearTimeout(timer); dismiss(); });
}

function getStorageValue(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([key], (result) => {
      const error = chrome.runtime.lastError;
      if (error) { reject(new Error(error.message)); return; }
      resolve(result[key]);
    });
  });
}

function setStorageValue(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) { reject(new Error(error.message)); return; }
      resolve();
    });
  });
}

async function init() {
  try {
    const savedKey = await getStorageValue("openrouterApiKey");
    if (savedKey) {
      apiKeyInput.value = savedKey;
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not load key.", "error");
  }
}

saveButton.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showToast("Please enter a key before saving.", "error");
    return;
  }
  try {
    await setStorageValue("openrouterApiKey", apiKey);
    showToast("API key saved.", "success");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not save key.", "error");
  }
});

clearButton.addEventListener("click", async () => {
  apiKeyInput.value = "";
  try {
    await setStorageValue("openrouterApiKey", "");
    showToast("API key cleared.", "info");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Could not clear key.", "error");
  }
});

init();
