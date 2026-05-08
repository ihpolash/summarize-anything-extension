# Summarize Anything (Chrome Extension)

Summarize any webpage and ask questions grounded in the current page content using OpenRouter free models.

## Features

- Popup UI for quick summary and Q&A
- Side panel UI for longer Q&A sessions
- Reads active page context (title, URL, visible text)
- Uses OpenRouter Chat Completions API
- Stores API key in `chrome.storage.sync` (per Chrome profile)

## Project Structure

- `manifest.json` - Extension config (Manifest V3)
- `src/background.js` - Message routing, prompt assembly, OpenRouter calls
- `src/content.js` - Page text extraction
- `src/popup.html`, `src/popup.js` - Popup UI
- `src/sidepanel.html`, `src/sidepanel.js` - Side panel UI
- `src/options.html`, `src/options.js` - API key settings
- `src/styles.css` - Shared styling

## Setup

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project directory:
   - `chrome-extensions/summarize-anything`
5. Open extension **Details** -> **Extension options**
6. Paste your OpenRouter API key and click **Save**

## Usage

1. Open any webpage.
2. Open extension popup:
   - Click **Summarize** for page summary.
   - Enter a question and click **Ask**.
3. Optionally click **Open Side Panel** for a larger interface.

## Permissions

- `activeTab`, `tabs`: Access currently active tab context
- `scripting`: Fallback extraction on pages where message flow fails
- `storage`: Save/read OpenRouter API key
- `sidePanel`: Enable side panel UI
- `host_permissions`:
  - `https://openrouter.ai/*` for API calls
  - `<all_urls>` for page content extraction

## Error Handling

- Missing API key -> asks user to configure key in options
- Empty page text -> clear extraction error message
- Request timeout -> handled by abort controller
- API/HTTP failures -> surfaced in popup/side panel status

## Privacy Notes

- Page content is sent to OpenRouter to generate answers.
- Text is truncated before request to reduce payload size.
- Keep sensitive tabs in mind before running summarization.

## Recommended Security Step

If your API key was exposed in chat or code history, revoke it in OpenRouter and generate a new one.
