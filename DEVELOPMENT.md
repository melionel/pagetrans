# Development Guide

## Extension Architecture

### Core Components

1. **Manifest (manifest.json)**
   - Extension configuration and permissions
   - Defines popup, content scripts, and background worker
   - Specifies required permissions for web access and storage

2. **Popup Interface (popup.html/js)**
   - User interface for quick translation
   - Language and LLM service selection
   - Status display and settings access

3. **Content Script (content.js)**
   - Runs on all web pages
   - Finds and processes text nodes
   - Applies translations with layout preservation
   - Handles font size adjustments

4. **Background Script (background.js)**
   - Service worker for API communication
   - Handles LLM API calls (OpenAI, Anthropic, Google, Custom)
   - Manages translation caching
   - Processes batch translation requests

5. **Options Page (options.html/js)**
   - Advanced configuration interface
   - API key management for all LLM services
   - Default preferences

## Key Features Explained

### Smart Text Detection
The content script uses `createTreeWalker` to efficiently traverse the DOM and find translatable text:

```javascript
const walker = document.createTreeWalker(
  element,
  NodeFilter.SHOW_TEXT,
  {
    acceptNode: (node) => {
      // Filters out scripts, styles, hidden elements
      // Checks visibility and text length
      // Returns FILTER_ACCEPT for valid text nodes
    }
  }
);
```

### Layout Preservation
- Maintains original DOM structure
- Only modifies `textContent`, never DOM hierarchy
- Applies subtle font size adjustments based on text length ratios
- Adds visual indicators without disrupting layout

### Font Size Adjustment Algorithm
```javascript
const lengthRatio = originalText.length / translatedText.length;

if (lengthRatio < 0.7) {
  // Text much longer → reduce font size
  const newFontSize = Math.max(originalFontSize * 0.9, originalFontSize - 2);
} else if (lengthRatio > 1.5) {
  // Text much shorter → increase font size  
  const newFontSize = Math.min(originalFontSize * 1.1, originalFontSize + 2);
}
```

### Batch Translation Strategy
- Groups text nodes into batches of 20
- Reduces API calls and improves performance
- Handles API rate limits gracefully
- Continues translation even if some batches fail

## LLM Integration

### OpenAI GPT
- Uses Chat Completions API
- Supports GPT-3.5 Turbo, GPT-4, GPT-4 Turbo
- Optimized prompts for translation quality

### Anthropic Claude
- Uses Messages API with latest version
- Supports Claude 3 models (Haiku, Sonnet, Opus)
- Handles different response format

### Google Gemini
- Uses Generative Language API
- Supports Gemini Pro and Pro Vision
- Free tier available for testing

### Custom API
- Generic interface for any OpenAI-compatible API
- Configurable endpoint and model name
- Flexible response parsing

## Error Handling

### Network Errors
- Graceful fallback for API failures
- User-friendly error messages
- Continues with remaining text if partial failure

### DOM Errors
- Protects against pages that modify DOM during translation
- Validates text nodes before modification
- Safe revert functionality

### API Errors
- Specific error messages for different failure types
- API key validation
- Rate limit handling

## Performance Optimizations

### Translation Cache
- Prevents duplicate API calls for same content
- Memory-based cache during session
- Key format: `${service}-${language}-${JSON.stringify(texts)}`

### Efficient DOM Traversal
- Single-pass text node discovery
- Minimal DOM manipulation
- Batch processing reduces overhead

### Asynchronous Processing
- Non-blocking translation process
- Progress indicators for user feedback
- Cancellable operations

## Security Considerations

### API Key Storage
- Uses Chrome's secure storage API
- Keys never exposed in page context
- Background script isolation

### Content Script Security
- Minimal permissions required
- No eval() or unsafe DOM manipulation
- XSS protection through proper text handling

### Privacy Protection
- No data sent to extension servers
- Direct API communication only
- Local-only caching

## Future Enhancement Ideas

### Advanced Features
1. **Selective Translation**
   - Allow users to select specific text/elements
   - Skip navigation and UI elements
   - Custom element exclusion rules

2. **Translation History**
   - Save translation sessions
   - Export/import functionality
   - Translation comparison

3. **Enhanced Language Detection**
   - Auto-detect source language
   - Mixed-language page handling
   - Language-specific optimizations

4. **Visual Improvements**
   - Better progress indicators
   - Smooth transitions
   - Customizable UI themes

5. **Advanced Settings**
   - Custom translation prompts
   - Quality/speed trade-offs
   - Element-specific rules

### Technical Improvements
1. **Better Caching**
   - Persistent cache across sessions
   - Smart cache invalidation
   - Compression for large texts

2. **Performance Monitoring**
   - Translation speed metrics
   - Error rate tracking
   - Usage analytics

3. **Accessibility**
   - Screen reader compatibility
   - Keyboard navigation
   - High contrast mode

## Testing Strategy

### Manual Testing
1. **Basic Functionality**
   - Translation on various websites
   - All LLM services
   - Different languages

2. **Edge Cases**
   - Very long pages
   - Dynamic content
   - Complex layouts
   - Special characters

3. **Error Scenarios**
   - Invalid API keys
   - Network failures
   - Malformed responses

### Automated Testing
- Unit tests for utility functions
- Integration tests for API calls
- E2E tests for full workflow

## Deployment

### Chrome Web Store
1. Prepare extension package
2. Create developer account
3. Submit for review
4. Handle review feedback

### Edge Add-ons Store
1. Same package works for Edge
2. Separate submission process
3. Microsoft partner account required

### Self-Distribution
- Load unpacked for development
- Package as .crx for enterprise
- Documentation for manual installation

## Contributing Guidelines

### Code Style
- Use ES6+ features where supported
- Consistent indentation (2 spaces)
- Meaningful variable names
- Comment complex logic

### Git Workflow
- Feature branches for new functionality
- Clear commit messages
- Pull request reviews
- Semantic versioning

### Documentation
- Update README for new features
- Comment public APIs
- Example usage for new options
- Migration guides for breaking changes
