# Page Translator Browser Extension

A Chrome/Edge browser extension that translates web pages using configurable LLM services while preserving layout and styling.

## Features

- **Multiple LLM Support**: OpenAI GPT, Azure OpenAI, Anthropic Claude, Google Gemini, and Custom APIs
- **In-place Translation**: Replaces text directly on the page while maintaining layout
- **Smart Font Sizing**: Automatically adjusts font sizes to preserve visual balance
- **Language Detection**: Supports 12+ languages including Spanish, French, German, Japanese, Chinese, etc.
- **Translation Cache**: Avoids re-translating the same content
- **Easy Revert**: One-click to restore original text
- **Hover Reveal**: View the original text when hovering over a translation (can be disabled in settings)
- **Parallel Translation**: Processes multiple batches simultaneously for faster results (configurable)

## Installation

### For Development

1. Clone or download this repository
2. Open Chrome/Edge and navigate to `chrome://extensions/` or `edge://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your browser toolbar

## Configuration

1. Click the extension icon in your browser toolbar
2. Click "⚙️ Advanced Settings" to open the options page
3. Configure your API keys for the LLM services you want to use:

### OpenAI GPT
- Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- Choose model (GPT-3.5 Turbo recommended for cost/performance)

### Azure OpenAI
- Get API key and endpoint from the Azure portal
- Provide your deployment name and API version in settings

### Anthropic Claude
- Get API key from [Anthropic Console](https://console.anthropic.com/)
- Choose model (Claude 3 Sonnet recommended)

### Google Gemini
- Get API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- Choose model (Gemini Pro recommended)

### Custom API
- Configure your own LLM API endpoint
- Must accept OpenAI-compatible requests

## Usage

1. **Navigate** to any web page you want to translate
2. **Click** the Page Translator extension icon
3. **Select** your target language from the dropdown
4. **Choose** your preferred LLM service
5. **Click** "Translate Page" to start translation
6. **Wait** for the translation to complete (progress shown in popup)
7. **Click** "Revert" to restore original text
8. **Optional**: Disable "Show original text on hover" in settings if you don't want to see the source text when hovering
9. **Optional**: Adjust the "Parallel Requests" value in settings for faster or slower translations

## How It Works

### Text Detection
- Scans the page for all visible text nodes
- Excludes scripts, styles, and hidden elements
- Filters out very short text snippets

### Translation Process
- Groups text into batches for efficient API calls
- Sends requests to configured LLM service
- Applies translations while preserving context

### Layout Preservation
- Maintains original DOM structure
- Adjusts font sizes based on text length changes
- Adds subtle visual indicators for translated text

### Smart Font Sizing
- If translated text is much longer: slightly reduces font size
- If translated text is much shorter: slightly increases font size
- Keeps changes minimal to preserve design

## File Structure

```
pagetrans/
├── manifest.json          # Extension configuration
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── options.html          # Settings page
├── options.js            # Settings functionality
├── content.js            # Content script for page manipulation
├── content.css           # Content script styles
├── background.js         # Service worker for API calls
├── icons/                # Extension icons (16, 32, 48, 128px)
└── README.md            # This file
```

## API Usage and Costs

- **OpenAI**: Pay per token, GPT-3.5 is cost-effective
- **Azure OpenAI**: Billed through your Azure subscription
- **Anthropic**: Pay per token, Claude 3 Sonnet balanced cost/quality
- **Google**: Free tier available, then pay per use
- **Custom**: Depends on your API provider

## Privacy

- No data is stored on external servers by this extension
- API calls go directly to your configured LLM provider
- Original text is cached locally for revert functionality
- Translation cache is stored locally to avoid duplicate API calls

## Troubleshooting

### "API key not configured" error
- Open settings and add your API key for the selected LLM service

### Translation not working
- Check your internet connection
- Verify API key is correct and has credits/quota
- Try a different LLM service
- Check browser console for detailed errors

### Layout issues after translation
- Click "Revert" to restore original text
- Some websites with complex CSS may have layout quirks
- Try refreshing the page and translating again

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use and modify for your needs.

## Version History

- **v1.0.0**: Initial release with multi-LLM support and layout preservation
