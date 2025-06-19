// Background script for Page Translator extension

// Store translation cache to avoid re-translating same content
const translationCache = new Map();

// Create context menu for translating selected text
chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'translate-selection',
      title: 'Translate Selection',
      contexts: ['selection']
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'translate-selection' && tab?.id) {
    const { targetLanguage, llmService } = await chrome.storage.sync.get([
      'targetLanguage',
      'llmService'
    ]);

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
      // ignore injection errors
    }

    chrome.tabs.sendMessage(
      tab.id,
      {
        action: 'translateSelection',
        targetLanguage: targetLanguage || 'en',
        llmService: llmService || 'openai'
      },
      (response) => {
        if (chrome.runtime.lastError) {
          showNotification('Translation failed: ' + chrome.runtime.lastError.message);
        } else if (!response?.success) {
          showNotification('Translation failed: ' + (response?.error || 'Unknown error'));
        }
      }
    );
  }
});

function showNotification(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: 'Page Translator',
    message
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslation(request, sendResponse);
    return true; // Indicates async response
  }
});

async function handleTranslation(request, sendResponse) {
  try {
    const { texts, targetLanguage, llmService, context } = request;
    
    // Get API configuration
    const settings = await chrome.storage.sync.get([
      'openaiApiKey',
      'azureApiKey',
      'azureEndpoint',
      'azureDeployment',
      'azureApiVersion',
      'anthropicApiKey',
      'googleApiKey',
      'customApiKey',
      'customApiUrl',
      'customModel',
      'openaiModel',
      'anthropicModel',
      'googleModel'
    ]);

    let apiKey;
    switch (llmService) {
      case 'openai':
        apiKey = settings.openaiApiKey;
        break;
      case 'azure':
        apiKey = settings.azureApiKey;
        break;
      case 'anthropic':
        apiKey = settings.anthropicApiKey;
        break;
      case 'google':
        apiKey = settings.googleApiKey;
        break;
      case 'custom':
        apiKey = settings.customApiKey;
        break;
    }

    if (!apiKey) {
      sendResponse({ success: false, error: 'API key not configured' });
      return;
    }

    settings.apiKey = apiKey;
    
    // Check cache first
    const cacheKey = `${llmService}-${targetLanguage}-${JSON.stringify(texts)}`;
    if (translationCache.has(cacheKey)) {
      sendResponse({ success: true, translations: translationCache.get(cacheKey), tokens: 0 });
      return;
    }
    
    let result;

    switch (llmService) {
      case 'openai':
        result = await translateWithOpenAI(texts, targetLanguage, settings, context);
        break;
      case 'azure':
        result = await translateWithAzureOpenAI(texts, targetLanguage, settings, context);
        break;
      case 'anthropic':
        result = await translateWithAnthropic(texts, targetLanguage, settings, context);
        break;
      case 'google':
        result = await translateWithGoogle(texts, targetLanguage, settings, context);
        break;
      case 'custom':
        result = await translateWithCustomAPI(texts, targetLanguage, settings, context);
        break;
      default:
        throw new Error('Unknown LLM service');
    }
    
    // Cache the result
    translationCache.set(cacheKey, result.translations);

    sendResponse({ success: true, translations: result.translations, tokens: result.tokens });
    
  } catch (error) {
    console.error('Translation error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function translateWithOpenAI(texts, targetLanguage, settings, context) {
  const model = settings.openaiModel || 'gpt-3.5-turbo';
  
  const prompt = createTranslationPrompt(texts, targetLanguage, context);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Consider the webpage context to provide natural translations without changing the original meaning. Return the translations in the same order, separated by newlines.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  const translatedText = data.choices[0].message.content.trim();
  const tokens = data.usage?.total_tokens || 0;

  return { translations: parseTranslationResponse(translatedText, texts.length), tokens };
}

async function translateWithAzureOpenAI(texts, targetLanguage, settings, context) {
  const apiVersion = settings.azureApiVersion || '2024-02-15-preview';
  const deployment = settings.azureDeployment;
  const endpoint = settings.azureEndpoint?.replace(/\/$/, '');

  if (!endpoint || !deployment) {
    throw new Error('Azure endpoint or deployment not configured');
  }

  const prompt = createTranslationPrompt(texts, targetLanguage, context);

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': settings.apiKey
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Consider the webpage context to provide natural translations without changing the original meaning. Return the translations in the same order, separated by newlines.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Azure API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const translatedText = data.choices[0].message.content.trim();
  const tokens = data.usage?.total_tokens || 0;

  return { translations: parseTranslationResponse(translatedText, texts.length), tokens };
}

async function translateWithAnthropic(texts, targetLanguage, settings, context) {
  const model = settings.anthropicModel || 'claude-3-sonnet-20240229';
  
  const prompt = createTranslationPrompt(texts, targetLanguage, context);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: `You are a professional translator. Consider the webpage context to provide natural translations without changing the original meaning. Translate the following texts to ${getLanguageName(targetLanguage)}. Return the translations in the same order, separated by newlines.\n\n${prompt}`
        }
      ]
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  const translatedText = data.content[0].text.trim();
  const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  return { translations: parseTranslationResponse(translatedText, texts.length), tokens };
}

async function translateWithGoogle(texts, targetLanguage, settings, context) {
  const model = settings.googleModel || 'gemini-pro';
  
  const prompt = createTranslationPrompt(texts, targetLanguage, context);
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `You are a professional translator. Consider the webpage context to provide natural translations without changing the original meaning. Translate the following texts to ${getLanguageName(targetLanguage)}. Return the translations in the same order, separated by newlines.\n\n${prompt}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4000
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Google API error: ${error.error?.message || response.statusText}`);
  }
  
  const data = await response.json();
  const translatedText = data.candidates[0].content.parts[0].text.trim();
  const tokens = data.usageMetadata?.totalTokenCount || data.usageMetadata?.totalTokens || 0;

  return { translations: parseTranslationResponse(translatedText, texts.length), tokens };
}

async function translateWithCustomAPI(texts, targetLanguage, settings, context) {
  if (!settings.customApiUrl) {
    throw new Error('Custom API URL not configured');
  }
  
  const prompt = createTranslationPrompt(texts, targetLanguage, context);
  
  const response = await fetch(settings.customApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.customModel || 'default',
      prompt: `You are a professional translator. Consider the webpage context to provide natural translations without changing the original meaning. Translate the following texts to ${getLanguageName(targetLanguage)}. Return the translations in the same order, separated by newlines.\n\n${prompt}`,
      temperature: 0.3,
      max_tokens: 4000
    })
  });
  
  if (!response.ok) {
    throw new Error(`Custom API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  const translatedText = data.response || data.text || data.output;
  
  if (!translatedText) {
    throw new Error('Invalid response format from custom API');
  }

  return { translations: parseTranslationResponse(translatedText.trim(), texts.length), tokens: 0 };
}

function createTranslationPrompt(texts, targetLanguage, context = '') {
  const languageName = getLanguageName(targetLanguage);
  const numberedTexts = texts.map((text, index) => `${index + 1}. ${text}`).join('\n');
  const ctx = context ? `Context: ${context}\n\n` : '';

  return `${ctx}Translate these texts to ${languageName}:\n\n${numberedTexts}`;
}

function parseTranslationResponse(translatedText, expectedCount) {
  // Split by newlines and clean up
  let translations = translatedText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  // Remove numbering if present
  translations = translations.map(translation => {
    return translation.replace(/^\d+\.\s*/, '');
  });
  
  // Ensure we have the expected number of translations
  if (translations.length < expectedCount) {
    // If we have fewer translations, repeat the last one or use original
    while (translations.length < expectedCount) {
      translations.push(translations[translations.length - 1] || '');
    }
  } else if (translations.length > expectedCount) {
    // If we have too many, take only the first ones
    translations = translations.slice(0, expectedCount);
  }
  
  return translations;
}

function getLanguageName(languageCode) {
  const languages = {
    'es': 'Español',
    'fr': 'Français',
    'de': 'Deutsch',
    'it': 'Italiano',
    'pt': 'Português',
    'ru': 'Русский',
    'ja': '日本語',
    'ko': '한국어',
    'zh': '简体中文',
    'zh-TW': '繁體中文',
    'ar': 'العربية',
    'hi': 'हिन्दी',
    'en': 'English'
  };
  
  return languages[languageCode] || languageCode;
}
