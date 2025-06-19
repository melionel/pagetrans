// Content script for Page Translator extension

class PageTranslator {
  constructor() {
    this.originalTexts = new Map();
    this.translatedTexts = new Map();
    this.parentMap = new Map();
    this.isTranslated = false;
    this.translationInProgress = false;
    this.paused = false;
    this.stopRequested = false;
    this.overlay = null;
    this.overlayBar = null;
    this.overlayToken = null;
    this.pauseBtn = null;
    this.showOriginalOnHover = false;
    this.showTranslationIndicator = true;
    this.maxParallel = 3;
    this.totalGroups = 0;
    this.groupsCompleted = 0;
    this.tokenUsage = 0;

    this.lastSelectionRange = null;

    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
        this.lastSelectionRange = sel.getRangeAt(0).cloneRange();
      }
    });

    this.handleMouseEnter = this.handleMouseEnter.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
  }

  async translatePage(targetLanguage, llmService) {
    if (this.translationInProgress) {
      return { success: false, error: 'Translation already in progress' };
    }

    this.translationInProgress = true;
    this.stopRequested = false;
    this.paused = false;
    this.createOverlay();

    try {
      const { showOriginalOnHover, parallelRequests, showTranslationIndicator } = await chrome.storage.sync.get(['showOriginalOnHover', 'parallelRequests', 'showTranslationIndicator']);
      this.showOriginalOnHover = typeof showOriginalOnHover === 'undefined' ? true : !!showOriginalOnHover;
      this.showTranslationIndicator = typeof showTranslationIndicator === 'undefined' ? true : !!showTranslationIndicator;
      const pr = parseInt(parallelRequests, 10);
      this.maxParallel = pr >= 1 && pr <= 100 ? pr : 3;

      // Find all text nodes
      const textNodes = this.findTextNodes(document.body);
      
      if (textNodes.length === 0) {
        return { success: false, error: 'No text found to translate' };
      }

      // Group text nodes for batch translation
      const textGroups = this.groupTextNodes(textNodes);

      this.totalGroups = textGroups.length;
      this.groupsCompleted = 0;
      this.tokenUsage = 0;
      this.reportProgress();

      await this.processGroups(textGroups, targetLanguage, llmService);

      this.isTranslated = true;
      this.reportProgress();
      return { success: true, tokens: this.tokenUsage };
      
    } catch (error) {
      console.error('Page translation error:', error);
      return { success: false, error: error.message };
    } finally {
      this.translationInProgress = false;
      this.removeOverlay();
    }
  }

  async translateSelection(targetLanguage, llmService) {
    if (this.translationInProgress) {
      return { success: false, error: 'Translation already in progress' };
    }

    let range;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
      range = selection.getRangeAt(0).cloneRange();
      this.lastSelectionRange = range.cloneRange();
    } else if (this.lastSelectionRange && this.lastSelectionRange.toString().trim()) {
      range = this.lastSelectionRange.cloneRange();
    } else {
      return { success: false, error: 'No text selected' };
    }

    const textNodes = this.findTextNodesInRange(range);

    if (textNodes.length === 0) {
      return { success: false, error: 'No text found in selection' };
    }

    this.translationInProgress = true;
    this.stopRequested = false;
    this.paused = false;
    this.createOverlay();

    try {
      const { showOriginalOnHover, parallelRequests, showTranslationIndicator } = await chrome.storage.sync.get([
        'showOriginalOnHover',
        'parallelRequests',
        'showTranslationIndicator'
      ]);
      this.showOriginalOnHover = typeof showOriginalOnHover === 'undefined' ? true : !!showOriginalOnHover;
      this.showTranslationIndicator = typeof showTranslationIndicator === 'undefined' ? true : !!showTranslationIndicator;
      const pr = parseInt(parallelRequests, 10);
      this.maxParallel = pr >= 1 && pr <= 100 ? pr : 3;

      const textGroups = this.groupTextNodes(textNodes);

      this.totalGroups = textGroups.length;
      this.groupsCompleted = 0;
      this.tokenUsage = 0;
      this.reportProgress();

      await this.processGroups(textGroups, targetLanguage, llmService);

      this.isTranslated = true;
      this.reportProgress();
      return { success: true, tokens: this.tokenUsage };

    } catch (error) {
      console.error('Selection translation error:', error);
      return { success: false, error: error.message };
    } finally {
      this.translationInProgress = false;
      this.removeOverlay();
    }
  }

  findTextNodes(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
      nodes.push(node);
    }

    for (const n of nodes) {
      const parent = n.parentElement;
      if (!parent) continue;

      const tagName = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'iframe', 'object'].includes(tagName)) {
        continue;
      }

      // Handle comments inside <code> or <pre> blocks
      if (parent.closest('code, pre')) {
        const comments = this.extractCommentNodes(n);
        for (const c of comments) {
          const txt = c.textContent.trim();
          if (txt.length >= 2) {
            textNodes.push(c);
          }
        }
        continue;
      }

      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }

      const text = n.textContent.trim();
      if (text.length < 2) {
        continue;
      }

      textNodes.push(n);
    }

    return textNodes;
  }

  findTextNodesInRange(range) {
    const textNodes = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
      nodes.push(node);
    }

    for (const n of nodes) {
      if (!range.intersectsNode(n)) continue;
      const parent = n.parentElement;
      if (!parent) continue;

      const tagName = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'iframe', 'object'].includes(tagName)) {
        continue;
      }

      if (parent.closest('code, pre')) {
        const comments = this.extractCommentNodes(n);
        for (const c of comments) {
          if (range.intersectsNode(c)) {
            const txt = c.textContent.trim();
            if (txt.length >= 2) {
              textNodes.push(c);
            }
          }
        }
        continue;
      }

      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }

      const text = n.textContent.trim();
      if (text.length < 2) {
        continue;
      }

      textNodes.push(n);
    }

    return textNodes;
  }

  extractCommentNodes(node) {
    const commentNodes = [];
    const text = node.textContent;
    const regex = /(\/\/.*|\/\*[\s\S]*?\*\/|#.*$|<!--[\s\S]*?-->)/gm;
    const matches = Array.from(text.matchAll(regex));
    if (matches.length === 0) {
      return commentNodes;
    }

    let current = node;
    let offset = 0;
    for (const match of matches) {
      const start = match.index;
      const end = start + match[0].length;
      if (start > offset) {
        current = current.splitText(start - offset);
        offset = start;
      }
      const after = current.splitText(end - offset);
      commentNodes.push(current);
      current = after;
      offset = end;
    }
    return commentNodes;
  }

  groupTextNodes(textNodes) {
    const groups = [];
    const groupSize = 20; // Translate in batches of 20 texts
    
    for (let i = 0; i < textNodes.length; i += groupSize) {
      groups.push(textNodes.slice(i, i + groupSize));
    }
    
    return groups;
  }

  async processGroups(groups, targetLanguage, llmService) {
    let index = 0;
    const workers = [];
    const concurrency = Math.min(this.maxParallel, groups.length);

    const work = async () => {
      while (true) {
        if (this.stopRequested) break;
        await this.waitWhilePaused();
        let currentIndex;
        if (index >= groups.length) break;
        currentIndex = index++;
        const group = groups[currentIndex];
        try {
          const tokens = await this.translateGroup(group, targetLanguage, llmService);
          this.groupsCompleted++;
          this.tokenUsage += tokens;
          this.reportProgress();
          this.updateOverlay();
        } catch (error) {
          console.error('Translation error for group:', error);
        }
      }
    };

    for (let i = 0; i < concurrency; i++) {
      workers.push(work());
    }

    await Promise.all(workers);
  }

  async translateGroup(group, targetLanguage, llmService) {
    const texts = group.map(node => node.textContent.trim()).filter(text => text.length > 0);
    if (texts.length === 0) return 0;

    const context = document.title || '';
    const { translations, tokens } = await this.requestTranslation(texts, targetLanguage, llmService, context);

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
    return tokens;
  }

  async requestTranslation(texts, targetLanguage, llmService, context) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'translate',
        texts: texts,
        targetLanguage: targetLanguage,
        llmService: llmService,
        context: context
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.success) {
          resolve({ translations: response.translations, tokens: response.tokens || 0 });
        } else {
          reject(new Error(response.error || 'Translation failed'));
        }
      });
    });
  }

  applyTranslation(textNode, translatedText, originalText) {
    const parent = textNode.parentElement;
    if (!parent) return;

    // Apply translation without altering original font styling
    textNode.textContent = translatedText;
    
    // Add a subtle indicator that this text was translated
    if (this.showTranslationIndicator) {
      parent.setAttribute('data-translated', 'true');
    }

    if (this.showOriginalOnHover) {
      if (!this.parentMap.has(parent)) {
        this.parentMap.set(parent, []);
        parent.addEventListener('mouseenter', this.handleMouseEnter);
        parent.addEventListener('mouseleave', this.handleMouseLeave);
      }
      this.parentMap.get(parent).push(textNode);
    }
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

          if (this.parentMap.has(parent)) {
            parent.removeEventListener('mouseenter', this.handleMouseEnter);
            parent.removeEventListener('mouseleave', this.handleMouseLeave);
            this.parentMap.delete(parent);
          }
        }
      }

      // Clear stored data
      this.originalTexts.clear();
      this.translatedTexts.clear();
      this.parentMap.clear();
      this.isTranslated = false;

      return { success: true };
    } catch (error) {
      console.error('Revert error:', error);
      return { success: false, error: error.message };
    }
  }

  handleMouseEnter(event) {
    const parent = event.currentTarget;
    const nodes = this.parentMap.get(parent) || [];
    for (const node of nodes) {
      const original = this.originalTexts.get(node);
      if (original) {
        node.textContent = original;
      }
    }
  }

  handleMouseLeave(event) {
    const parent = event.currentTarget;
    const nodes = this.parentMap.get(parent) || [];
    for (const node of nodes) {
      const translated = this.translatedTexts.get(node);
      if (translated) {
        node.textContent = translated;
      }
    }
  }

  createOverlay() {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.className = 'page-translator-overlay';
    this.overlay.innerHTML = `
      <div class="page-translator-overlay-bar">
        <div class="page-translator-progress-bar"></div>
      </div>
      <div class="page-translator-token">Tokens: 0</div>
      <div class="page-translator-btns">
        <button class="page-translator-pause">Pause</button>
        <button class="page-translator-stop">Stop</button>
      </div>`;
    document.body.appendChild(this.overlay);
    this.overlayBar = this.overlay.querySelector('.page-translator-progress-bar');
    this.overlayToken = this.overlay.querySelector('.page-translator-token');
    this.pauseBtn = this.overlay.querySelector('.page-translator-pause');
    const stopBtn = this.overlay.querySelector('.page-translator-stop');
    this.pauseBtn.addEventListener('click', () => {
      if (this.paused) {
        this.resumeTranslation();
        this.pauseBtn.textContent = 'Pause';
      } else {
        this.pauseTranslation();
        this.pauseBtn.textContent = 'Resume';
      }
    });
    stopBtn.addEventListener('click', () => {
      this.stopTranslation();
    });
  }

  updateOverlay() {
    if (!this.overlayBar || !this.overlayToken) return;
    const percent = this.totalGroups ? Math.round((this.groupsCompleted / this.totalGroups) * 100) : 0;
    this.overlayBar.style.width = percent + '%';
    this.overlayToken.textContent = `Tokens: ${this.tokenUsage}`;
  }

  removeOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  pauseTranslation() {
    this.paused = true;
  }

  resumeTranslation() {
    this.paused = false;
  }

  stopTranslation() {
    this.stopRequested = true;
  }

  async waitWhilePaused() {
    while (this.paused && !this.stopRequested) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  reportProgress() {
    chrome.runtime.sendMessage({
      action: 'translationProgress',
      completed: this.groupsCompleted,
      total: this.totalGroups,
      tokens: this.tokenUsage
    });
    this.updateOverlay();
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

  if (request.action === 'translateSelection') {
    pageTranslator.translateSelection(request.targetLanguage, request.llmService)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'revertTranslation') {
    const result = pageTranslator.revertTranslation();
    sendResponse(result);
  }

  if (request.action === 'pauseTranslation') {
    pageTranslator.pauseTranslation();
    sendResponse({ success: true });
  }

  if (request.action === 'resumeTranslation') {
    pageTranslator.resumeTranslation();
    sendResponse({ success: true });
  }

  if (request.action === 'stopTranslation') {
    pageTranslator.stopTranslation();
    sendResponse({ success: true });
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
