// Content script for Page Translator extension

class PageTranslator {
  constructor() {
    this.originalTexts = new Map();
    this.translatedTexts = new Map();
    this.isTranslated = false;
    this.translationInProgress = false;
  }

  async translatePage(targetLanguage, llmService) {
    if (this.translationInProgress) {
      return { success: false, error: 'Translation already in progress' };
    }

    this.translationInProgress = true;

    try {
      // Find all text nodes
      const textNodes = this.findTextNodes(document.body);
      
      if (textNodes.length === 0) {
        return { success: false, error: 'No text found to translate' };
      }

      // Group text nodes for batch translation
      const textGroups = this.groupTextNodes(textNodes);
      
      // Translate each group
      for (const group of textGroups) {
        const texts = group.map(node => node.textContent.trim()).filter(text => text.length > 0);
        
        if (texts.length === 0) continue;

        try {
          const translations = await this.requestTranslation(texts, targetLanguage, llmService);
          
          // Apply translations
          for (let i = 0; i < group.length && i < translations.length; i++) {
            const node = group[i];
            const originalText = node.textContent;
            const translatedText = translations[i];
            
            if (originalText.trim() && translatedText && translatedText !== originalText) {
              this.originalTexts.set(node, originalText);
              this.translatedTexts.set(node, translatedText);
              
              // Apply translation with font size adjustment
              this.applyTranslation(node, translatedText, originalText);
            }
          }
        } catch (error) {
          console.error('Translation error for group:', error);
          // Continue with next group even if one fails
        }
      }

      this.isTranslated = true;
      return { success: true };
      
    } catch (error) {
      console.error('Page translation error:', error);
      return { success: false, error: error.message };
    } finally {
      this.translationInProgress = false;
    }
  }

  findTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip script, style, and other non-visible elements
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'iframe', 'object'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if parent is hidden
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if text is too short or only whitespace
          const text = node.textContent.trim();
          if (text.length < 2 || /^\s*$/.test(text)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    return textNodes;
  }

  groupTextNodes(textNodes) {
    const groups = [];
    const groupSize = 20; // Translate in batches of 20 texts
    
    for (let i = 0; i < textNodes.length; i += groupSize) {
      groups.push(textNodes.slice(i, i + groupSize));
    }
    
    return groups;
  }

  async requestTranslation(texts, targetLanguage, llmService) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'translate',
        texts: texts,
        targetLanguage: targetLanguage,
        llmService: llmService
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.success) {
          resolve(response.translations);
        } else {
          reject(new Error(response.error || 'Translation failed'));
        }
      });
    });
  }

  applyTranslation(textNode, translatedText, originalText) {
    const parent = textNode.parentElement;
    if (!parent) return;

    // Store original font size
    const originalStyle = window.getComputedStyle(parent);
    const originalFontSize = parseFloat(originalStyle.fontSize);
    
    // Calculate length ratio
    const lengthRatio = originalText.length / translatedText.length;
    
    // Apply translation
    textNode.textContent = translatedText;
    
    // Adjust font size to maintain visual balance
    if (lengthRatio < 0.7) {
      // Translated text is much longer, reduce font size slightly
      const newFontSize = Math.max(originalFontSize * 0.9, originalFontSize - 2);
      parent.style.fontSize = `${newFontSize}px`;
    } else if (lengthRatio > 1.5) {
      // Translated text is much shorter, increase font size slightly
      const newFontSize = Math.min(originalFontSize * 1.1, originalFontSize + 2);
      parent.style.fontSize = `${newFontSize}px`;
    }
    
    // Add a subtle indicator that this text was translated
    parent.setAttribute('data-translated', 'true');
  }

  revertTranslation() {
    if (!this.isTranslated) {
      return { success: false, error: 'No translation to revert' };
    }

    try {
      // Restore original texts
      for (const [node, originalText] of this.originalTexts) {
        if (node.parentElement) {
          node.textContent = originalText;
          
          // Remove font size adjustments
          const parent = node.parentElement;
          parent.style.fontSize = '';
          parent.removeAttribute('data-translated');
        }
      }

      // Clear stored data
      this.originalTexts.clear();
      this.translatedTexts.clear();
      this.isTranslated = false;

      return { success: true };
    } catch (error) {
      console.error('Revert error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Initialize translator
const pageTranslator = new PageTranslator();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translatePage') {
    pageTranslator.translatePage(request.targetLanguage, request.llmService)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Indicates async response
  }
  
  if (request.action === 'revertTranslation') {
    const result = pageTranslator.revertTranslation();
    sendResponse(result);
  }
});

// Add visual indicator for translated elements
const style = document.createElement('style');
style.textContent = `
  [data-translated="true"] {
    position: relative;
  }
  
  [data-translated="true"]::after {
    content: "🌐";
    position: absolute;
    top: -2px;
    right: -2px;
    font-size: 8px;
    opacity: 0.3;
    pointer-events: none;
  }
`;
document.head.appendChild(style);
