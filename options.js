// Options page script for Page Translator extension

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initEventListeners();
});

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'openaiApiKey',
    'openaiModel',
    'azureApiKey',
    'azureEndpoint',
    'azureDeployment',
    'azureApiVersion',
    'anthropicApiKey',
    'anthropicModel',
    'googleApiKey',
    'googleModel',
    'customApiUrl',
    'customApiKey',
    'customModel',
    'targetLanguage',
    'llmService',
    'showOriginalOnHover',
    'parallelRequests',
    'showTranslationIndicator'
  ]);
  
  // Load OpenAI settings
  if (settings.openaiApiKey) {
    document.getElementById('openaiApiKey').value = settings.openaiApiKey;
  }
  if (settings.openaiModel) {
    document.getElementById('openaiModel').value = settings.openaiModel;
  }

  // Load Azure OpenAI settings
  if (settings.azureApiKey) {
    document.getElementById('azureApiKey').value = settings.azureApiKey;
  }
  if (settings.azureEndpoint) {
    document.getElementById('azureEndpoint').value = settings.azureEndpoint;
  }
  if (settings.azureDeployment) {
    document.getElementById('azureDeployment').value = settings.azureDeployment;
  }
  if (settings.azureApiVersion) {
    document.getElementById('azureApiVersion').value = settings.azureApiVersion;
  }
  
  // Load Anthropic settings
  if (settings.anthropicApiKey) {
    document.getElementById('anthropicApiKey').value = settings.anthropicApiKey;
  }
  if (settings.anthropicModel) {
    document.getElementById('anthropicModel').value = settings.anthropicModel;
  }
  
  // Load Google settings
  if (settings.googleApiKey) {
    document.getElementById('googleApiKey').value = settings.googleApiKey;
  }
  if (settings.googleModel) {
    document.getElementById('googleModel').value = settings.googleModel;
  }
  
  // Load Custom API settings
  if (settings.customApiUrl) {
    document.getElementById('customApiUrl').value = settings.customApiUrl;
  }
  if (settings.customApiKey) {
    document.getElementById('customApiKey').value = settings.customApiKey;
  }
  if (settings.customModel) {
    document.getElementById('customModel').value = settings.customModel;
  }
  
  // Load preferences
  if (settings.targetLanguage) {
    document.getElementById('defaultLanguage').value = settings.targetLanguage;
  }
  if (settings.llmService) {
    document.getElementById('defaultLlm').value = settings.llmService;
  }
  if (typeof settings.showOriginalOnHover === 'undefined') {
    document.getElementById('hoverOriginal').checked = true;
  } else {
    document.getElementById('hoverOriginal').checked = !!settings.showOriginalOnHover;
  }
  if (typeof settings.showTranslationIndicator === 'undefined') {
    document.getElementById('showIndicator').checked = true;
  } else {
    document.getElementById('showIndicator').checked = !!settings.showTranslationIndicator;
  }
  if (typeof settings.parallelRequests === 'undefined') {
    document.getElementById('parallelRequests').value = '3';
  } else {
    document.getElementById('parallelRequests').value = settings.parallelRequests;
  }
}

function initEventListeners() {
  document.querySelectorAll('.toggle-header').forEach(header => {
    const section = header.dataset.section;
    if (section) {
      header.addEventListener('click', () => toggleSection(section));
    }
  });

  const saveBtn = document.getElementById('saveButton');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }

  const resetBtn = document.getElementById('resetButton');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetSettings);
  }
}

async function saveSettings() {
  const settings = {
    // OpenAI
    openaiApiKey: document.getElementById('openaiApiKey').value.trim(),
    openaiModel: document.getElementById('openaiModel').value,

    // Azure OpenAI
    azureApiKey: document.getElementById('azureApiKey').value.trim(),
    azureEndpoint: document.getElementById('azureEndpoint').value.trim(),
    azureDeployment: document.getElementById('azureDeployment').value.trim(),
    azureApiVersion: document.getElementById('azureApiVersion').value.trim(),
    
    // Anthropic
    anthropicApiKey: document.getElementById('anthropicApiKey').value.trim(),
    anthropicModel: document.getElementById('anthropicModel').value,
    
    // Google
    googleApiKey: document.getElementById('googleApiKey').value.trim(),
    googleModel: document.getElementById('googleModel').value,
    
    // Custom API
    customApiUrl: document.getElementById('customApiUrl').value.trim(),
    customApiKey: document.getElementById('customApiKey').value.trim(),
    customModel: document.getElementById('customModel').value.trim(),
    
    // Preferences
    targetLanguage: document.getElementById('defaultLanguage').value,
    llmService: document.getElementById('defaultLlm').value,
    showOriginalOnHover: document.getElementById('hoverOriginal').checked,
    showTranslationIndicator: document.getElementById('showIndicator').checked,
    parallelRequests: parseInt(document.getElementById('parallelRequests').value, 10) || 3
  };
  
  // Set the main API key based on selected service
  const selectedService = settings.llmService;
  switch (selectedService) {
    case 'openai':
      settings.apiKey = settings.openaiApiKey;
      break;
    case 'azure':
      settings.apiKey = settings.azureApiKey;
      break;
    case 'anthropic':
      settings.apiKey = settings.anthropicApiKey;
      break;
    case 'google':
      settings.apiKey = settings.googleApiKey;
      break;
    case 'custom':
      settings.apiKey = settings.customApiKey;
      break;
  }
  
  try {
    await chrome.storage.sync.set(settings);
    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings. Please try again.', 'error');
  }
}

function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults? This will clear all API keys.')) {
    // Clear all form fields
    document.getElementById('openaiApiKey').value = '';
    document.getElementById('openaiModel').value = 'gpt-3.5-turbo';
    document.getElementById('azureApiKey').value = '';
    document.getElementById('azureEndpoint').value = '';
    document.getElementById('azureDeployment').value = '';
    document.getElementById('azureApiVersion').value = '2024-02-15-preview';
    document.getElementById('anthropicApiKey').value = '';
    document.getElementById('anthropicModel').value = 'claude-3-sonnet-20240229';
    document.getElementById('googleApiKey').value = '';
    document.getElementById('googleModel').value = 'gemini-pro';
    document.getElementById('customApiUrl').value = '';
    document.getElementById('customApiKey').value = '';
    document.getElementById('customModel').value = '';
    document.getElementById('defaultLanguage').value = 'es';
    document.getElementById('defaultLlm').value = 'openai';
    document.getElementById('hoverOriginal').checked = true;
    document.getElementById('showIndicator').checked = true;
    document.getElementById('parallelRequests').value = '3';

    // Clear storage
    chrome.storage.sync.clear(() => {
      showStatus('Settings reset to defaults', 'success');
    });
  }
}

function toggleSection(sectionId) {
  const content = document.getElementById(`${sectionId}-content`);
  const arrow = document.getElementById(`${sectionId}-arrow`);
  
  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    arrow.classList.add('expanded');
  } else {
    content.classList.add('hidden');
    arrow.classList.remove('expanded');
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
  
  // Scroll to status
  statusDiv.scrollIntoView({ behavior: 'smooth' });
}
