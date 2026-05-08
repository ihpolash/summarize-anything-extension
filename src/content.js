function isVisibleElement(element) {
  if (!element || !(element instanceof Element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  return true;
}

function getVisibleText() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const chunks = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || !isVisibleElement(parent)) {
      continue;
    }

    const text = node.textContent ? node.textContent.trim() : "";
    if (text.length > 0) {
      chunks.push(text);
    }
  }

  return chunks.join("\n");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXTRACT_PAGE_CONTENT") {
    return;
  }

  const pageText = getVisibleText();
  sendResponse({
    ok: true,
    data: {
      title: document.title || "",
      url: window.location.href || "",
      text: pageText
    }
  });
});
