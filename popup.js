// Popup script for Page Translator extension

let isTranslating = false;

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'targetLanguage',
    'llmService',
    'apiKey'
  ]);
  
  if (settings.targetLanguage) {
    document.getElementById('targetLanguage').value = settings.targetLanguage;
  }
  
  if (settings.llmService) {
    document.getElementById('llmService').value = settings.llmService;
  }
}

function setupEventListeners() {
  document.getElementById('translateBtn').addEventListener('click', handleTranslate);
  document.getElementById('revertBtn').addEventListener('click', handleRevert);
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', handleSavePage);
  }
  document.getElementById('settingsLink').addEventListener('click', openSettings);
  
  // Save settings on change
  document.getElementById('targetLanguage').addEventListener('change', saveSettings);
  document.getElementById('llmService').addEventListener('change', saveSettings);
}

async function saveSettings() {
  const settings = {
    targetLanguage: document.getElementById('targetLanguage').value,
    llmService: document.getElementById('llmService').value
  };
  
  await chrome.storage.sync.set(settings);
}

async function handleTranslate() {
  if (isTranslating) return;
  
  const translateBtn = document.getElementById('translateBtn');
  const targetLanguage = document.getElementById('targetLanguage').value;
  const llmService = document.getElementById('llmService').value;
  
  // Check if API key is configured
  const keys = await chrome.storage.sync.get([
    'openaiApiKey',
    'azureApiKey',
    'azureEndpoint',
    'azureDeployment',
    'anthropicApiKey',
    'googleApiKey',
    'customApiKey',
    'customApiUrl'
  ]);

  let apiKey;
  switch (llmService) {
    case 'openai':
      apiKey = keys.openaiApiKey;
      break;
    case 'azure':
      apiKey = keys.azureApiKey;
      break;
    case 'anthropic':
      apiKey = keys.anthropicApiKey;
      break;
    case 'google':
      apiKey = keys.googleApiKey;
      break;
    case 'custom':
      apiKey = keys.customApiKey;
      break;
  }

  if (llmService === 'custom' && (!apiKey || !keys.customApiUrl)) {
    showStatus('Please configure your custom API URL and key in settings first', 'error');
    return;
  }

  if (llmService === 'azure' && (!apiKey || !keys.azureEndpoint || !keys.azureDeployment)) {
    showStatus('Please configure your Azure endpoint, deployment, and key first', 'error');
    return;
  }

  if (llmService !== 'custom' && !apiKey) {
    showStatus('Please configure your API key in settings first', 'error');
    return;
  }
  
  isTranslating = true;
  translateBtn.textContent = 'Translating...';
  translateBtn.disabled = true;
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Ensure we have a valid tab with an allowed scheme
    if (!tab || /^\s*$/.test(tab.url) ||
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://')) {
      showStatus('Cannot translate this page.', 'error');
      return;
    }

    // Save settings first
    await saveSettings();

    // Inject content script in case it didn't load automatically
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
    } catch (e) {
      // Ignore errors (script may already be injected)
    }

    // Send message to all frames to start translation
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
    for (const frame of frames) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'translatePage',
        targetLanguage,
        llmService
      }, { frameId: frame.frameId }).catch(err => console.error('Translate start error:', err));
    }

    closePopup();
  } catch (error) {
    console.error('Translation error:', error);
    showStatus('Translation failed. Please try again.', 'error');
  } finally {
    isTranslating = false;
    translateBtn.textContent = 'Translate Page';
    translateBtn.disabled = false;
  }
}

async function handleRevert() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'revertTranslation'
    });
    
    if (response && response.success) {
      showStatus('Page reverted to original text', 'success');
    } else {
      showStatus('Failed to revert page', 'error');
    }
  } catch (error) {
    console.error('Revert error:', error);
    showStatus('Failed to revert page', 'error');
  }
}

async function handleSavePage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageHTML' });
    if (response && response.html) {
      const blob = new Blob([response.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const filename = `translated_page_${Date.now()}.html`;
      await chrome.downloads.download({ url, filename, saveAs: true });
      showStatus('Page saved to Downloads', 'success');
    } else {
      showStatus('Failed to retrieve page', 'error');
    }
  } catch (error) {
    console.error('Save page error:', error);
    showStatus('Failed to save page', 'error');
  }
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function closePopup() {
  document.body.classList.add('fade-out');
  setTimeout(() => window.close(), 200);
}
