import { html, render } from "lit-html";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";
import { parseFile, parseFileFromUrl } from "./file-parser.js";
import {
  generateSchema,
  generateDbtRules,
  setCustomPrompts,
  getCurrentPrompts,
  resetPrompts,
  streamChatResponse,
  resetChatHistory,
} from "./llm-service.js";
import {
  renderResults,
  renderSchemaResults,
  renderSchemaOverview,
  renderColumnDescriptions,
  renderRelationships,
  renderJoinsAndModeling,
  renderChatMessage,
  showDbtRuleLoadingIndicator,
} from "./ui.js";
import { renderDataIngestion } from "./data-ingestion.js";
import { exportDbtLocalZip } from "./dbt-local-service.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { DataComparator } from "./comparator.js";

const marked = new Marked();
let fileData = null, schemaData = null, dbtRulesData = null, llmConfig = null, chatAttachedFile = null;
let dataComparator = null;

window.currentFileData = null;

function getSelectedModel() {
  return document.getElementById("model-select")?.value || localStorage.getItem('selectedModel') || 'gpt-4.1-mini';
}

function getLLMConfig() {
  return llmConfig;
}

async function init() {
  setupEventListeners();
  await initLlmConfig();
  await loadPromptsIntoTextareas();
  initializeComparator();
}

function initializeComparator() {
  dataComparator = new DataComparator();
}

// Update comparator file status when file data changes
function updateComparatorStatus() {
  if (dataComparator) {
    dataComparator.updateFileStatus();
  }
}

function setupEventListeners() {
  const eventMap = {
    "upload-form": { event: "submit", handler: handleFileUpload },
    "run-dbt-locally-btn": { event: "click", handler: handleRunDbtLocally },
    "configure-llm-btn": { event: "click", handler: handleConfigureLlm },
    "generate-dbt-btn": { event: "click", handler: handleGenerateDbtRules },
    "save-prompts-btn": { event: "click", handler: handleSavePrompts },
    "reset-prompts-btn": { event: "click", handler: handleResetPrompts },
    "chat-float-btn": { event: "click", handler: toggleFloatingChat },
    "close-chat-btn": { event: "click", handler: toggleFloatingChat },
    "reset-chat-btn-floating": { event: "click", handler: handleResetChat },
    "chat-form-floating": { event: "submit", handler: handleChatSubmit },
    "sample-datasets-btn": { event: "click", handler: handleSampleDatasetsClick }
  };


  Object.entries(eventMap).forEach(([id, { event, handler }]) => {
    document.getElementById(id)?.addEventListener(event, handler);
  });

  setupChatFileListeners();
  setupChatResize();
}

function setupChatFileListeners() {
  const elements = {
    attachBtn: document.getElementById("chat-attach-btn"),
    fileInput: document.getElementById("chat-file-input"),
    dropZone: document.getElementById("chat-drop-zone"),
    fileRemove: document.getElementById("chat-file-remove")
  };

  elements.attachBtn?.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput?.addEventListener("change", (e) => e.target.files[0] && handleChatFileSelect(e.target.files[0]));
  elements.fileRemove?.addEventListener("click", clearChatFile);

  const dragHandlers = {
    dragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary"); },
    dragleave: (e) => e.currentTarget.classList.remove("border-primary"),
    drop: (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove("border-primary");
      e.dataTransfer.files[0] && handleChatFileSelect(e.dataTransfer.files[0]);
    }
  };

  Object.entries(dragHandlers).forEach(([event, handler]) => {
    elements.dropZone?.addEventListener(event, handler);
  });
}

function setupChatResize() {
  const chatContainer = document.getElementById('chat-container-floating');
  const handles = chatContainer?.querySelectorAll('.resize-handle');
  
  if (!chatContainer || !handles) return;

  handles.forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      
      // Extract direction from single class check
      const classList = handle.classList;
      const direction = {
        n: classList.contains('resize-n') || classList.contains('resize-ne') || classList.contains('resize-nw'),
        s: classList.contains('resize-s') || classList.contains('resize-se') || classList.contains('resize-sw'),
        e: classList.contains('resize-e') || classList.contains('resize-se') || classList.contains('resize-ne'),
        w: classList.contains('resize-w') || classList.contains('resize-sw') || classList.contains('resize-nw')
      };
      
      const startX = e.clientX, startY = e.clientY;
      const rect = chatContainer.getBoundingClientRect();
      const startWidth = rect.width, startHeight = rect.height;
      const startRight = parseFloat(getComputedStyle(chatContainer).right);
      const startBottom = parseFloat(getComputedStyle(chatContainer).bottom);
      
      const constraints = { minWidth: 300, minHeight: 400, maxWidth: innerWidth * 0.8, maxHeight: innerHeight * 0.8 };
      
      function doResize(e) {
        const deltaX = e.clientX - startX, deltaY = e.clientY - startY;
        
        let newWidth = direction.e ? startWidth + deltaX : direction.w ? startWidth - deltaX : startWidth;
        let newHeight = direction.s ? startHeight + deltaY : direction.n ? startHeight - deltaY : startHeight;
        
        // Apply constraints and adjust position if needed
        const constrainDimension = (value, min, max, isReverse, startPos, startDim) => {
          if (value < min) return { size: min, pos: isReverse ? startPos + startDim - min : startPos };
          if (value > max) return { size: max, pos: isReverse ? startPos + startDim - max : startPos };
          return { size: value, pos: isReverse ? startPos + startDim - value : startPos };
        };
        
        const width = constrainDimension(newWidth, constraints.minWidth, constraints.maxWidth, direction.w, startRight, startWidth);
        const height = constrainDimension(newHeight, constraints.minHeight, constraints.maxHeight, direction.n, startBottom, startHeight);
        
        chatContainer.style.width = width.size + 'px';
        chatContainer.style.height = height.size + 'px';
        if (direction.w) chatContainer.style.right = width.pos + 'px';
        if (direction.n) chatContainer.style.bottom = height.pos + 'px';
      }
      
      const stopResize = () => {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
      };
      
      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
    });
  });
}

function handleChatFileSelect(file) {
  chatAttachedFile = file;
  document.getElementById("chat-file-name").textContent = file.name;
  document.getElementById("chat-file-preview").classList.remove("d-none");
}

function clearChatFile() {
  chatAttachedFile = null;
  document.getElementById("chat-file-preview").classList.add("d-none");
  document.getElementById("chat-file-input").value = '';
}

async function loadPromptsIntoTextareas() {
  const prompts = await getCurrentPrompts();
  document.getElementById("schema-prompt").value = prompts.schema;
  document.getElementById("dbt-prompt").value = prompts.dbtRules;
  const savedModel = localStorage.getItem('selectedModel') || 'gpt-4.1-mini';
  document.getElementById("model-select").value = savedModel;
}

function handleSavePrompts() {
  const schemaPrompt = document.getElementById("schema-prompt").value.trim();
  const dbtPrompt = document.getElementById("dbt-prompt").value.trim();
  const selectedModel = document.getElementById("model-select").value;
  
  if (!schemaPrompt || !dbtPrompt) return updateStatus("Please fill in both prompts before saving", "warning");
  
  setCustomPrompts({ schema: schemaPrompt, dbtRules: dbtPrompt });
  localStorage.setItem('selectedModel', selectedModel);
  updateStatus("Custom prompts and model selection saved successfully", "success");
}

async function handleResetPrompts() {
  resetPrompts();
  await loadPromptsIntoTextareas();
  document.getElementById("model-select").value = 'gpt-4.1-mini';
  localStorage.setItem('selectedModel', 'gpt-4.1-mini');
  updateStatus("Prompts and model selection reset to default", "info");
}

function handleResetChat() {
  resetChatHistory();
  clearChatFile();
  render(html``, document.getElementById("chat-messages-floating"));
  updateStatus("Chat history has been reset", "info");
}

function handleSampleDatasetsClick() {
  const container = document.getElementById('sample-datasets-container');
  if (container && container.querySelectorAll('.sample-dataset-card').length === 0) {
    loadSampleDatasets();
  }
}

async function loadSampleDatasets() {
  const config = await (await fetch('./config.json')).json();
  const container = document.getElementById('sample-datasets-container');
  const datasets = config.demos || [];
  
  render(html`${datasets.map(dataset => html`
    <div class="col-md-6 col-lg-4 mb-3">
      <div class="card h-100 sample-dataset-card" data-url="${dataset.href}" data-title="${dataset.title}" 
           style="cursor: pointer; transition: transform 0.2s; position: relative;">
        <div class="card-body">
          <h5 class="card-title">${dataset.title}</h5>
          <p class="card-text text-muted">${dataset.body}</p>
        </div>
        <div class="card-footer d-flex justify-content-between align-items-center bg-transparent border-0">
          <small class="text-muted">Click to analyze</small>
          <button class="btn btn-outline-primary btn-sm view-dataset-btn" 
                  data-url="${dataset.href}" 
                  data-title="${dataset.title}"
                  title="View dataset in browser">
            <i class="bi bi-eye"></i> View
          </button>
        </div>
      </div>
    </div>
  `)}`, container);
  
  container.querySelectorAll('.sample-dataset-card').forEach(card => {
    card.addEventListener('click', handleSampleDatasetClick);
    ['mouseenter', 'mouseleave'].forEach((event, i) => {
      card.addEventListener(event, () => {
        card.style.transform = i ? 'translateY(0)' : 'translateY(-2px)';
        card.style.boxShadow = i ? 'none' : '0 4px 8px rgba(0,0,0,0.1)';
      });
    });
  });
  
  // Add event listeners for view buttons
  container.querySelectorAll('.view-dataset-btn').forEach(btn => {
    btn.addEventListener('click', handleViewDatasetClick);
  });
}

function handleViewDatasetClick(event) {
  event.stopPropagation(); // Prevent card click
  const { url, title } = event.currentTarget.dataset;
  
  if (!url) {
    updateStatus("No URL available for this dataset", "warning");
    return;
  }
  
  const extension = url.split('.').pop().toLowerCase();
  
  if (extension === 'csv') {
    // For CSV files, show options to user
    showCsvViewerOptions(url, title);
  } else {
    // For other files, use direct viewer
    const viewerUrl = generateViewerUrl(url, title);
    window.open(viewerUrl, '_blank', 'noopener,noreferrer');
    updateStatus(`Opening ${title} in new tab...`, "info");
  }
}

function showCsvViewerOptions(csvUrl, title) {
  const encodedUrl = encodeURIComponent(csvUrl);
  
  // Create a modal or alert with multiple viewing options
  const options = [
    {
      name: "📋 View Raw CSV",
      description: "View the raw CSV file content",
      url: csvUrl
    },
    {
      name: "📊 Try Office Viewer",
      description: "Attempt to view with Microsoft Office Web Viewer",
      url: `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`
    },
    {
      name: "📈 Open in Google Sheets",
      description: "Import to Google Sheets (requires Google account)",
      url: `https://docs.google.com/spreadsheets/u/0/create?usp=sheets_web_ug_dm#importurl=${encodedUrl}`
    }
  ];
  
  // For now, let's use the raw CSV view as the most reliable option
  window.open(csvUrl, '_blank', 'noopener,noreferrer');
  updateStatus(`Opening ${title} (CSV) in new tab...`, "info");
}

function generateViewerUrl(fileUrl, title) {
  const encodedUrl = encodeURIComponent(fileUrl);
  
  // Check file extension to determine viewer
  const extension = fileUrl.split('.').pop().toLowerCase();
  
  switch (extension) {
    case 'xlsx':
    case 'xls':
      // Use Microsoft Office Web Viewer for Excel files
      return `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
    
    case 'csv':
      // CSV files are handled separately in handleViewDatasetClick
      return fileUrl;
    
    default:
      // For other formats, try Office viewer
      return `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
  }
}

async function handleSampleDatasetClick(event) {
  // Check if the click was on the view button or its children
  if (event.target.closest('.view-dataset-btn')) {
    return; // Don't handle card click if view button was clicked
  }
  
  const { url, title } = event.currentTarget.dataset;
  
  if (!url || !llmConfig) {
    updateStatus("Please configure LLM settings first", "warning");
    return;
  }
  
  const card = event.currentTarget;
  card.style.opacity = '0.6';
  card.style.pointerEvents = 'none';
  setLoading("upload", true);
  updateStatus(`Loading ${title}...`, "info");
  
  try {
    await processFile(await parseFileFromUrl(url, title), title);
  } catch (error) {
    updateStatus(`Error loading ${title}: ${error.message}`, "danger");
  } finally {
    setLoading("upload", false);
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
  }
}

function getGlobalTableRules() {
  const rulesInput = document.getElementById('table-classification-rules');
  return rulesInput ? rulesInput.value.trim() : '';
}


async function processFile(data, name = null) {
  fileData = data;
  window.currentFileData = fileData;
  document.getElementById("results-container").classList.remove("d-none");
  
  // Update comparator status with new file data
  updateComparatorStatus();
  
  schemaData = { schemas: [], relationships: [], suggestedJoins: [], modelingRecommendations: [] };
  renderSchemaResults(schemaData);
  updateStatus("Generating schema...", "info");
  
  const globalTableRules = getGlobalTableRules();
  schemaData = await generateSchema(fileData, llmConfig, (partialData) => {
    if (partialData) {
      if (!partialData.relationships) partialData.relationships = [];
      renderSchemaOverview(partialData);
      renderColumnDescriptions(partialData);
      renderRelationships(partialData);
      renderJoinsAndModeling(partialData);
    }
  }, getSelectedModel(), globalTableRules);
  
  if (!schemaData.relationships) schemaData.relationships = [];
  renderSchemaResults(schemaData);
  window.currentSchemaData = schemaData;
  renderDataIngestion(schemaData);
  document.getElementById("generate-dbt-btn").classList.remove("d-none");
  updateStatus(`Schema generation complete${name ? ` for ${name}` : ''}!`, "success");
}

const llmConfigOptions = {
  defaultBaseUrls: ["https://api.openai.com/v1", "https://openrouter.com/api/v1", "http://localhost:11434/v1"],
  help: '<div class="alert alert-info">This app requires an LLM API to generate DBT rules from your data files. You can use OpenAI, OpenRouter, Ollama, or any OpenAI-compatible API.</div>',
  title: "LLM Provider Configuration",
  buttonLabel: "Save Configuration",
  show: false,
};

async function initLlmConfig() {
  try {
    llmConfig = await openaiConfig(llmConfigOptions);
    updateLlmConfigStatus("LLM configuration loaded successfully", "success");
  } catch (error) {
    updateLlmConfigStatus("Click 'Configure LLM Provider' to set up your API provider", "info");
  }
}

async function handleConfigureLlm() {
  try {
    updateLlmConfigStatus("Opening configuration modal...", "info");
    llmConfig = await openaiConfig({ ...llmConfigOptions, show: true });
    updateLlmConfigStatus("LLM configuration successful", "success");
  } catch (error) {
    updateLlmConfigStatus(`Failed to configure LLM: ${error.message}`, "danger");
  }
}

function updateLlmConfigStatus(message, type = "info") {
  const configContainer = document.getElementById("llm-config-container");
  configContainer.querySelectorAll(".alert").forEach(alert => alert.remove());
  
  const tempContainer = document.createElement("div");
  render(html`<div class="alert alert-${type} mt-2">${message}</div>`, tempContainer);
  
  const existingText = configContainer.querySelector(".text-muted");
  (existingText || configContainer).appendChild(tempContainer.firstElementChild);
  
  if (type === "success" || type === "info") {
    setTimeout(() => {
      const alert = configContainer.querySelector(`.alert-${type}`);
      if (alert && alert.textContent.trim() === message) alert.remove();
    }, 5000);
  }
}

async function handleFileUpload(event) {
  event.preventDefault();
  const file = document.getElementById("file-input").files[0];
  
  if (!file) return updateStatus("Please select a file to upload", "warning");
  if (!llmConfig) return updateStatus("Please configure LLM settings first by clicking 'Configure LLM Provider'", "warning");
  
  setLoading("upload", true);
  updateStatus("Processing file...", "info");
  
  try {
    await processFile(await parseFile(file));
    updateStatus("Schema generation complete! Click 'Generate DBT Rules' to proceed.", "success");
  } catch (error) {
    updateStatus(`Error: ${error.message}`, "danger");
  } finally {
    setLoading("upload", false);
  }
}

async function handleGenerateDbtRules() {
  if (!schemaData || !llmConfig) return updateStatus("Please upload a file and generate schema first", "warning");
  
  setLoading("generate-dbt", true);
  updateStatus("Generating DBT rules...", "info");
  
  try {
    dbtRulesData = { dbtRules: [], globalRecommendations: [] };
    renderResults(schemaData, dbtRulesData);
    
    dbtRulesData = await generateDbtRules(schemaData, llmConfig, (partialData) => {
      if (partialData) renderResults(schemaData, partialData);
    }, getSelectedModel());
    
    window.currentDbtRulesData = dbtRulesData;
    document.getElementById("chat-float-btn").classList.remove("d-none");
    document.getElementById("generate-dbt-btn").classList.add("d-none");
    updateStatus("DBT rules generation complete!", "success");
  } catch (error) {
    updateStatus(`Error generating DBT rules: ${error.message}`, "danger");
  } finally {
    setLoading("generate-dbt", false);
  }
}

function handleRunDbtLocally() {
  const checks = [
    [schemaData, "No data available to export"],
    [dbtRulesData?.dbtRules, "DBT rules are required for local development. Please generate DBT rules first."],
    [fileData?._originalFileContent, "Original dataset file is required for local development. Please upload a file first."]
  ];
  
  for (const [data, message] of checks) {
    if (!data) return updateStatus(message, "warning");
  }
  
  exportDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
}

function toggleFloatingChat() {
  const chat = document.getElementById("chat-container-floating");
  const isHidden = chat.classList.contains("d-none");
  chat.classList.toggle("d-none", !isHidden);
  chat.classList.toggle("d-block", isHidden);
  if (isHidden) document.getElementById("chat-input-floating").focus();
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const chatInput = document.getElementById("chat-input-floating");
  const userMessage = chatInput.value.trim();
  
  if (!userMessage || !llmConfig) return;
  
  let attachmentData = null, displayMessage = userMessage;
  
  if (chatAttachedFile) {
    try {
      attachmentData = await parseFile(chatAttachedFile);
      displayMessage += ` [Attached: ${chatAttachedFile.name}]`;
    } catch (error) {
      return renderChatMessage("system", `Error reading file: ${error.message}`);
    }
  }
  
  renderChatMessage("user", displayMessage);
  chatInput.value = "";
  if (chatAttachedFile) clearChatFile();
  setLoading("chat-floating", true);
  
  try {
    const context = { fileData: fileData || attachmentData, schema: schemaData, dbtRules: dbtRulesData, attachedFile: attachmentData };
    const placeholder = document.createElement("div");
    document.getElementById("chat-messages-floating").appendChild(placeholder);
    
    const response = await streamChatResponse(context, userMessage, llmConfig, (partial) => {
      if (partial === "Generating DBT rule modifications...") {
        placeholder.remove();
        showDbtRuleLoadingIndicator(true);
      } else {
        render(html`<div class="card mb-2"><div class="card-body"><p class="card-text">${formatChatMessageWithMarked(partial)}</p></div></div>`, placeholder);
        document.getElementById("chat-messages-floating").scrollTop = document.getElementById("chat-messages-floating").scrollHeight;
      }
    }, getSelectedModel());
    
    if (placeholder.parentNode) placeholder.remove();
    showDbtRuleLoadingIndicator(false);
    
    const rulesMatch = response.match(/<!-- UPDATED_DBT_RULES:(.+?) -->/s);
    if (rulesMatch) {
      try {
        dbtRulesData = JSON.parse(rulesMatch[1]);
        renderResults(schemaData, dbtRulesData);
        const clean = response.replace(/<!-- UPDATED_DBT_RULES:.+? -->/s, '').replace(/<!-- LAST_MODIFIED_TABLE:.+? -->/s, '');
        renderChatMessage("assistant", clean, true);
        if (clean.includes('DBT Rules Updated')) handleDbtRuleUpdate(response, clean);
      } catch {
        renderChatMessage("assistant", response, true);
      }
    } else {
      renderChatMessage("assistant", response, true);
    }
  } catch (error) {
    updateStatus(`Chat error: ${error.message}`, "danger");
    renderChatMessage("system", `Error: ${error.message}`);
  } finally {
    setLoading("chat-floating", false);
  }
}

function formatChatMessageWithMarked(message) {
  return message ? unsafeHTML(marked.parse(message)) : "";
}

function updateStatus(message, type = "info") {
  const container = document.getElementById("status-container");
  render(html`<div class="alert alert-${type} mt-3">${message}</div>`, container);
  if (type === "success" || type === "info") {
    setTimeout(() => {
      const alert = container.querySelector(`.alert-${type}`);
      if (alert && alert.textContent.trim() === message) render(html``, container);
    }, 5000);
  }
}

function setLoading(action, isLoading) {
  const spinner = document.getElementById(action === "chat-floating" ? "chat-spinner-floating" : `${action}-spinner`);
  const button = spinner?.closest("button");
  if (spinner && button) {
    spinner.classList.toggle("d-none", !isLoading);
    button.disabled = isLoading;
  }
}

function handleDbtRuleUpdate(fullResponse, cleanResponse) {
  // First navigate to Data Modeling group
  const modelingGroupTab = document.querySelector('[data-bs-target="#modeling-group"]');
  if (!modelingGroupTab?.click) return;
  
  modelingGroupTab.click();
  
  // Then navigate to DBT Rules subtab
  setTimeout(() => {
    const dbtTab = document.querySelector('[data-bs-target="#dbt-tab"]');
    if (dbtTab?.click) {
      dbtTab.click();
      
      setTimeout(() => {
        let tableName = fullResponse.match(/<!-- LAST_MODIFIED_TABLE:([^\s]+) -->/s)?.[1];
        let target = null;
        
        if (tableName) {
          target = Array.from(document.querySelectorAll('.card-header h5'))
            .find(card => card.textContent.includes(tableName))?.closest('.card');
        }
        
        if (!target) {
          tableName = cleanResponse.match(/(?:Added new rule|Modified rule) for table ['']([^']+)['']]/)?.[1];
          if (tableName) {
            target = Array.from(document.querySelectorAll('.card-header h5'))
              .find(card => card.textContent.includes(tableName))?.closest('.card');
          }
        }
        
        (target || document.getElementById('dbt-content'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, 100);
}

function expandAllCards(prefix) {
  document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
    if (el.classList.contains('collapse') && !el.classList.contains('show')) {
      new bootstrap.Collapse(el, { toggle: false }).show();
      document.querySelector(`[data-bs-target="#${el.id}"]`)?.setAttribute('aria-expanded', 'true');
    }
  });
}

window.expandAllCards = expandAllCards;
window.getSelectedModel = getSelectedModel;
window.getLLMConfig = getLLMConfig;
window.handleRunDbtLocally = handleRunDbtLocally;
window.updateStatus = updateStatus;
window.updateComparatorStatus = updateComparatorStatus;

document.addEventListener("DOMContentLoaded", init);