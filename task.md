## DBT Rules Gen

- Build a web application that allows users to upload .csv or .xlsx files, supporting multiple sheets per file.
- Upon upload, the app should extract the header and sample rows from each sheet and call an LLM API to generate the schema, including column names, data types, and inferred metadata.
- In a separate API call, send the generated schema to the LLM to produce DBT rules (e.g., models, tests, and configurations).
- Once both schema and DBT rules are ready, display the results in the UI with the following sections:

    - Schema Overview
    - Column Descriptions (with privacy indicators)
    - Generated DBT Rules
    - Provide a download option to export the output as a structured file (e.g., .json, .yaml, or .txt).

- Enable chat interface to interact with the uploaded file. Users should be able to:

    - Ask questions about the schema or data
    - Request edits or additions to the DBT rules
    - Perform exploratory data analysis via chat

## Coding Guidelines

- Write SHORT, CONCISE, READABLE code
- Deduplicate maximally. Use iteration, higher-order functions, vectorization
- Validate early via if-return pattern
- Avoid error handling unless an operation is error-prone
- Use functions, not classes
- Keep config in config files, not code (.env, config.json, config.toml)
- Keep code files under ~500 lines. Split logically
- Follow existing code & comment style
- Include type hints and single-line docstrings

HTML/CSS/JS:

- Use ESM: <script type="module">
- No TypeScript. Only JavaScript
- Use MODERN JavaScript. Minimize libraries
- Use hyphenated HTML class/ID names (id="user-id" not id="userId")
- For single line if / for statements, avoid { blocks }
- Show full errors to the user (beautifully) instead of console.error()
- Show a loading indicator while waiting for fetch()
- Avoid document.createElement. Use .insertAdjacentHTML / .replaceChildren (or lit-html)
- Use Bootstrap classes for CSS. Strictly NO custom CSS.

Linting:

JS, MD: npx -y prettier@3.5 --print-width=120 '**/*.js' '**/*.md'
HTML: npx -y js-beautify@1 '**/*.html' --type html --replace --indent-size 2 --max-preserve-newlines 1 --end-with-newline

For LLM Provider use https://github.com/sanand0/bootstrap-llm-provider :
Usage :

``` js

import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";

// Basic Config - Opens a model and asks user for provider details
const { baseUrl, apiKey, models } = await openaiConfig();

// API key is optional if your provider doesn't require one

// Always Show Modal - even if user has provided information before
const { baseUrl, apiKey, models } = await openaiConfig({ show: true });

// Custom Base URLs (datalist)
const { baseUrl, apiKey, models } = await openaiConfig({
  defaultBaseUrls: ["https://api.openai.com/v1", "https://openrouter.com/api/v1"],
});

// Base URL Options (select)
const { baseUrl, apiKey, models } = await openaiConfig({
  baseUrls: [
    { url: "https://api.openai.com/v1", name: "OpenAI" },
    { url: "https://openrouter.com/api/v1", name: "OpenRouter" },
  ],
  // baseUrls overrides defaultBaseUrls
});

// Custom Storage - store in sessionStorage.llmProvider
const { baseUrl, apiKey, models } = await openaiConfig({ storage: sessionStorage, key: "llmProvider" });

// Custom Labels
const { baseUrl, apiKey, models } = await openaiConfig({
  title: "Pick a provider",
  baseUrlLabel: "Your URL",
  apiKeyLabel: "Your Key",
  buttonLabel: "Save",
});

// Help HTML
const { baseUrl, apiKey, models } = await openaiConfig({
  help: '<div class="alert alert-info">Get your key from <a href="/">here</a></div>',
  show: true,
});

```
