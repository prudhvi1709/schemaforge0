# SchemaForge - Project Overview

## Executive Summary

SchemaForge is a modern web application that automatically generates DBT (Data Build Tool) rules from CSV and Excel files using Large Language Models (LLMs). It provides intelligent schema analysis, relationship detection, and complete DBT project generation with real-time streaming capabilities.

## Architecture Overview

### Technology Stack
- **Frontend**: Modern ES6 modules with Bootstrap 5 UI
- **Templating**: lit-html for dynamic DOM manipulation
- **File Processing**: XLSX library for CSV/Excel parsing
- **LLM Integration**: bootstrap-llm-provider for flexible API configuration
- **Streaming**: asyncLLM for real-time streaming responses
- **JSON Handling**: partial-json for parsing incomplete JSON during streaming
- **Visualization**: GoJS library for interactive entity relationship diagrams
- **Markdown**: Marked library for chat message formatting

### Core Application Flow
1. **File Upload** → Parse CSV/Excel files with multiple sheet support
2. **Schema Generation** → LLM analyzes structure and generates comprehensive schema (streaming)
3. **DBT Rules Generation** → Creates complete DBT models, tests, and configurations
4. **Visualization** → Interactive entity relationship diagrams
5. **Chat Interface** → Real-time Q&A and rule modifications
6. **Export** → Download structured schemas or complete DBT local development projects

## File Structure & Key Components

### Main Application Files
```
schemaforge/
├── index.html              # Main application interface (262 lines)
├── config.json            # Sample datasets configuration
├── task.md                # Development requirements and guidelines
├── js/
│   ├── main.js             # Application orchestration (477 lines)
│   ├── llm-service.js      # LLM API integration with streaming (373 lines)
│   ├── ui.js               # DOM manipulation and rendering (396 lines)
│   ├── file-parser.js      # CSV/Excel file parsing logic
│   ├── diagram.js          # Entity relationship diagram (GoJS)
│   ├── dbt-generation.js   # DBT rules generation and chat
│   ├── dbt-local-service.js # DBT local development project creation
│   ├── data-ingestion.js   # Data ingestion rendering
│   └── utils.js            # Utility functions
├── prompts/
│   ├── dbt-chat-system.md  # Chat interface system prompts
│   └── dbt-rules-generation.md # DBT rules generation templates
└── data/                   # Sample data files and conversion scripts
```

### Core Module Responsibilities

#### main.js (Application Entry Point)
- Event listener setup and orchestration
- File upload handling and processing
- LLM configuration management
- Chat interface coordination
- Sample dataset loading
- State management for file data, schema data, and DBT rules

#### llm-service.js (LLM Integration)
- Custom prompt management (schema and DBT rules)
- Schema generation with streaming updates
- Chat response streaming
- Integration with multiple LLM providers
- Chat history management
- Prompt template processing

#### ui.js (User Interface)
- Schema overview rendering with collapsible cards
- Column descriptions with badges and metadata
- Relationship visualization
- DBT rules display with tabbed interface
- Chat message rendering with markdown support
- Copy-to-clipboard functionality
- Loading indicators and status updates

## Key Features & Capabilities

### Data Processing
- **Multi-format Support**: CSV and Excel files with automatic sheet detection
- **Intelligent Parsing**: Header extraction and sample row analysis
- **Error Handling**: Graceful fallbacks for malformed files
- **Sample Datasets**: Pre-configured demo datasets for testing

### Schema Generation
- **Column Analysis**: Data type inference, PII detection, constraint suggestions
- **Relationship Detection**: Primary/foreign key identification, join pattern analysis
- **Real-time Streaming**: Progressive rendering as schema information is generated
- **Global Classification Rules**: Custom table classification and business logic
- **Metadata Enrichment**: Quality observations, validation rules, confidence levels

### DBT Rules Generation
- **Complete Models**: SQL with proper seed references using `{{ ref('seed_name') }}`
- **Comprehensive Tests**: not_null, unique, accepted_values, relationships validation
- **YAML Configurations**: Model documentation, column descriptions, test definitions
- **Materialization Strategies**: Table, view, incremental, ephemeral recommendations
- **Data Quality**: Custom tests and referential integrity validation

### Interactive Features
- **Entity Relationship Diagrams**: Drag-and-drop visualization with GoJS
- **Chat Interface**: Real-time Q&A about data and schema modifications
- **Streaming Responses**: Live updates during long-running operations
- **Rule Modifications**: Dynamic DBT rule updates through chat interface
- **Export Capabilities**: JSON schemas and complete DBT local development projects

### LLM Provider Support
- **OpenAI API**: Standard GPT models
- **OpenRouter**: Access to multiple model providers
- **Ollama**: Local deployment support
- **Custom APIs**: Any OpenAI-compatible endpoint
- **Model Selection**: Configurable model choices (gpt-4.1-mini, gpt-5-nano, gpt-5-mini)

## Development Guidelines

### Code Style & Standards
- **Modern JavaScript**: ES6 modules, async/await patterns
- **Functional Programming**: No classes, emphasis on pure functions
- **Modular Architecture**: Single responsibility principle, files under 500 lines
- **Bootstrap 5 Only**: No custom CSS, use Bootstrap classes exclusively
- **Error Handling**: Show full errors to users with proper formatting
- **Loading States**: Visual feedback for all async operations

### Naming Conventions
- **HTML**: Hyphenated class/ID names (`id="user-id"` not `id="userId"`)
- **JavaScript**: camelCase for variables and functions
- **Files**: kebab-case for multi-word filenames

### Performance Considerations
- **Streaming Implementation**: Real-time updates for better UX
- **Lazy Loading**: Collapse/expand interfaces to manage large datasets
- **Memory Management**: Proper cleanup of event listeners and DOM elements
- **Caching**: Configuration and prompt caching in localStorage

## Configuration & Customization

### LLM Configuration
```javascript
const llmConfigOptions = {
  defaultBaseUrls: [
    "https://api.openai.com/v1",
    "https://openrouter.com/api/v1", 
    "http://localhost:11434/v1"
  ],
  title: "LLM Provider Configuration",
  help: "HTML help content for users"
};
```

### Custom Prompts
- **Schema Generation**: Configurable prompt templates with variable substitution
- **DBT Rules**: Markdown-based prompt files in `/prompts/` directory
- **Global Rules**: User-defined table classification and business logic
- **Storage**: localStorage persistence for user customizations

### Sample Datasets
```json
{
  "demos": [
    {
      "title": "EHR Data",
      "href": "https://example.com/data.csv",
      "body": "Description of the dataset"
    }
  ]
}
```

## Quality Assurance & Validation

### Data Validation
- **Column Existence**: Verify column names before creating DBT tests
- **Schema Consistency**: Ensure relationships reference valid tables/columns
- **SQL Validation**: Proper seed references and join syntax
- **Type Safety**: Data type inference and constraint validation

### Error Handling
- **Graceful Degradation**: Partial results when LLM responses are incomplete
- **User Feedback**: Clear error messages and recovery suggestions
- **Retry Logic**: Automatic retries for transient API failures
- **Validation Checks**: Pre-flight validation before expensive operations

## Deployment & Usage

### Prerequisites
- Modern web browser with ES6 module support
- LLM API access (OpenAI, OpenRouter, or compatible provider)
- Local HTTP server for CORS compliance (recommended)

### Quick Start
```bash
# Serve locally (recommended)
python -m http.server 8000
# Open http://localhost:8000

# Or open directly in browser
open index.html
```

### Production Considerations
- **HTTPS Required**: For clipboard API and secure origins
- **CORS Configuration**: Proper headers for API access
- **Rate Limiting**: Consider LLM API rate limits for concurrent users
- **Caching Strategy**: Static asset caching for performance

## Extension Points

### Adding New LLM Providers
- Extend `llmConfigOptions.defaultBaseUrls`
- Ensure OpenAI-compatible API format
- Update help documentation for provider-specific setup

### Custom Prompt Templates
- Modify `/prompts/` markdown files
- Use variable substitution: `${variable}`
- Test with various data formats and edge cases

### New Export Formats
- Extend `dbt-local-service.js` for additional output formats
- Add new UI tabs and rendering components
- Implement format-specific validation and error handling

### Enhanced Visualizations
- Extend GoJS diagram configurations in `diagram.js`
- Add new chart types or interactive elements
- Integrate with additional visualization libraries

This overview provides the foundation for understanding, maintaining, and extending the SchemaForge application.