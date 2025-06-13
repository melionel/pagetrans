// Background script for Page Translator extension

// Store translation cache to avoid re-translating same content
const translationCache = new Map();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate') {
    handleTranslation(request, sendResponse);
    return true; // Indicates async response
  }
});

async function handleTranslation(request, sendResponse) {
  try {
    const { texts, targetLanguage, llmService } = request;
    
    // Get API configuration
    const settings = await chrome.storage.sync.get([
      'apiKey',
      'customApiUrl',
      'customModel',
      'openaiModel',
      'anthropicModel',
      'googleModel'
    ]);
    
    if (!settings.apiKey) {
      sendResponse({ success: false, error: 'API key not configured' });
      return;
    }
    
    // Check cache first
    const cacheKey = `${llmService}-${targetLanguage}-${JSON.stringify(texts)}`;
    if (translationCache.has(cacheKey)) {
      sendResponse({ success: true, translations: translationCache.get(cacheKey) });
      return;
    }
    
    let translations;
    
    switch (llmService) {
      case 'openai':
        translations = await translateWithOpenAI(texts, targetLanguage, settings);
        break;
      case 'anthropic':
        translations = await translateWithAnthropic(texts, targetLanguage, settings);
        break;
      case 'google':
        translations = await translateWithGoogle(texts, targetLanguage, settings);
        break;
      case 'custom':
        translations = await translateWithCustomAPI(texts, targetLanguage, settings);
        break;
      default:
        throw new Error('Unknown LLM service');
    }
    
    // Cache the result
    translationCache.set(cacheKey, translations);
    
    sendResponse({ success: true, translations });
    
  } catch (error) {
    console.error('Translation error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function translateWithOpenAI(texts, targetLanguage, settings) {
  const model = settings.openaiModel || 'gpt-3.5-turbo';
  
  const prompt = createTranslationPrompt(texts, targetLanguage);
  
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
          content: 'You are a professional translator. Translate the given texts to the target language while preserving the meaning, tone, and context. Return only the translations in the same order, separated by newlines.'
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
  
  return parseTranslationResponse(translatedText, texts.length);
}

async function translateWithAnthropic(texts, targetLanguage, settings) {
  const model = settings.anthropicModel || 'claude-3-sonnet-20240229';
  
  const prompt = createTranslationPrompt(texts, targetLanguage);
  
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
          content: `You are a professional translator. Translate the following texts to ${getLanguageName(targetLanguage)} while preserving meaning, tone, and context. Return only the translations in the same order, separated by newlines.\n\n${prompt}`
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
  
  return parseTranslationResponse(translatedText, texts.length);
}

async function translateWithGoogle(texts, targetLanguage, settings) {
  const model = settings.googleModel || 'gemini-pro';
  
  const prompt = createTranslationPrompt(texts, targetLanguage);
  
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
              text: `You are a professional translator. Translate the following texts to ${getLanguageName(targetLanguage)} while preserving meaning, tone, and context. Return only the translations in the same order, separated by newlines.\n\n${prompt}`
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
  
  return parseTranslationResponse(translatedText, texts.length);
}

async function translateWithCustomAPI(texts, targetLanguage, settings) {
  if (!settings.customApiUrl) {
    throw new Error('Custom API URL not configured');
  }
  
  const prompt = createTranslationPrompt(texts, targetLanguage);
  
  const response = await fetch(settings.customApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.customModel || 'default',
      prompt: `You are a professional translator. Translate the following texts to ${getLanguageName(targetLanguage)} while preserving meaning, tone, and context. Return only the translations in the same order, separated by newlines.\n\n${prompt}`,
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
  
  return parseTranslationResponse(translatedText.trim(), texts.length);
}

function createTranslationPrompt(texts, targetLanguage) {
  const languageName = getLanguageName(targetLanguage);
  const numberedTexts = texts.map((text, index) => `${index + 1}. ${text}`).join('\n');
  
  return `Translate these texts to ${languageName}:\n\n${numberedTexts}`;
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
    'es': 'Spanish',
    'fr': 'French', 
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'en': 'English'
  };
  
  return languages[languageCode] || languageCode;
}
