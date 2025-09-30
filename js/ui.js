import { html, render } from 'lit-html';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { renderEntityRelationshipDiagram } from './diagram.js';

const marked = new Marked();
const icons = {
  expand: html`<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8ZM7.646.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 1.707V5.5a.5.5 0 0 1-1 0V1.707L6.354 2.854a.5.5 0 0 1-.708-.708l2-2ZM8 10a.5.5 0 0 1 .5.5v3.793l1.146-1.147a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 0 1 .708-.708L7.5 14.293V10.5A.5.5 0 0 1 8 10Z"/></svg>`,
  chevron: html`<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>`,
  clipboard: html`<svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>`
};

const ui = {
  badge: (label, className) => html`<span class="badge ${className}">${label}</span>`,
  loading: (msg) => html`<div class="alert alert-info">${msg}</div>`,
  expandBtn: (prefix) => html`<div class="d-flex justify-content-end mb-3"><button class="btn btn-sm btn-outline-primary" onclick="expandAllCards('${prefix}')">${icons.expand} Expand All</button></div>`,
  collapsibleCard: (id, title, content, badges = '') => html`<div class="card mb-3"><div class="card-header" role="button" data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="false"><div class="d-flex justify-content-between align-items-center"><h5 class="mb-0">${title}${badges}</h5>${icons.chevron}</div></div><div class="collapse" id="${id}"><div class="card-body">${content}</div></div></div>`,
  tabPane: (type, tableId, content, active) => html`<div class="tab-pane fade ${active ? 'show active' : ''}" id="${type}-${tableId}"><div class="d-flex justify-content-end mb-2"><button class="btn btn-sm btn-outline-secondary copy-btn" data-content-id="${type}-content-${tableId}">${icons.clipboard} Copy</button></div><pre id="${type}-content-${tableId}"><code>${content}</code></pre></div>`,
  table: (headers, rows) => html`<div class="table-responsive"><table class="table table-sm"><thead><tr>${headers.map(h => html`<th>${h}</th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`
};

const createBadges = (col) => [...new Map([col.isPrimaryKey && {label: 'PK', class: 'bg-warning text-dark'}, col.isForeignKey && {label: 'FK', class: 'bg-info'}, col.isPII && {label: 'PII', class: 'bg-danger'}, col.dataClassification && {label: col.dataClassification, class: 'bg-primary'}, ...(col.flags || [])].filter(Boolean).map(b => [b.label, b])).values()].map(b => ui.badge(b.label, b.class || 'bg-secondary'));

const renderContent = (elementId, template, fallbackMsg) => {
  const content = document.getElementById(elementId);
  if (!content) return;
  render(template || ui.loading(fallbackMsg), content);
};

export function renderSchemaResults(schemaData) {
  [renderSchemaOverview, renderColumnDescriptions, renderRelationships, renderJoinsAndModeling, renderEntityRelationshipDiagram].forEach(fn => fn(schemaData));
  const dbtTab = document.querySelector('[data-bs-target="#dbt-tab"]');
  const dbtContent = document.getElementById('dbt-content');
  if (dbtTab && dbtContent) { dbtTab.style.display = 'none'; render(html`<div class="text-muted">Generate DBT rules first to see this content.</div>`, dbtContent); }
}

export function renderResults(schemaData, dbtRulesData) {
  renderSchemaResults(schemaData);
  renderDbtRules(dbtRulesData);
  document.querySelector('[data-bs-target="#dbt-tab"]')?.style.setProperty('display', 'block');
}

export function renderSchemaOverview(schemaData) {
  const template = schemaData?.schemas?.length ? html`${ui.expandBtn('schema-collapse')}${schemaData.schemas.map((schema, idx) => {
    const typeBadge = schema.tableType ? ui.badge(schema.tableType, 'bg-secondary ms-2') : '';
    const pkInfo = schema.primaryKey ? html`<div class="alert alert-info mt-2"><strong>Primary Key:</strong> ${schema.primaryKey.columns.join(', ')} ${ui.badge(schema.primaryKey.type, 'bg-primary ms-2')} ${ui.badge(`${schema.primaryKey.confidence} confidence`, 'bg-light text-dark ms-1')}</div>` : '';
    const columnsTable = ui.table(['Name', 'Type', 'Description', 'Flags'], schema.columns?.map(col => html`<tr><td>${col.name}</td><td><code>${col.dataType}</code></td><td>${col.description || 'Generating description...'}</td><td>${createBadges(col)}</td></tr>`) || html`<tr><td colspan="4">Loading column information...</td></tr>`);
    return ui.collapsibleCard(`schema-collapse-${idx}`, schema.tableName, html`<p>${schema.description || 'No description available'}</p>${pkInfo}<h6>Columns</h6>${columnsTable}`, typeBadge);
  })}` : null;
  renderContent("schema-content", template, "Generating schema information...");
}

export function renderColumnDescriptions(schemaData) {
  const template = schemaData?.schemas?.length ? html`${ui.expandBtn('column-collapse')}${schemaData.schemas.map((schema, schemaIdx) => html`<h5>${schema.tableName}</h5>${schema.columns?.map((col, colIdx) => {
    const fkInfo = col.foreignKeyReference ? html`<div class="alert alert-info mt-2"><strong>Foreign Key Reference:</strong><br>References: <code>${col.foreignKeyReference.referencedTable}.${col.foreignKeyReference.referencedColumn}</code> ${ui.badge(`${col.foreignKeyReference.confidence} confidence`, 'bg-light text-dark ms-2')}</div>` : '';
    const details = html`<p>${col.description || 'No description available'}</p>${fkInfo}${col.qualityObservations?.length ? html`<h6>Data Quality Observations</h6><ul>${col.qualityObservations.map(obs => html`<li>${obs}</li>`)}</ul>` : ''}${col.constraints?.length ? html`<h6>Constraints</h6><ul>${col.constraints.map(c => html`<li>${c}</li>`)}</ul>` : ''}`;
    return html`<div class="card mb-2"><div class="card-header d-flex justify-content-between align-items-center" role="button" data-bs-toggle="collapse" data-bs-target="#column-collapse-${schemaIdx}-${colIdx}"><span><strong>${col.name}</strong> <code class="ms-2">${col.dataType}</code></span><div class="d-flex align-items-center"><div class="me-2">${createBadges(col)}</div>${icons.chevron}</div></div><div class="collapse" id="column-collapse-${schemaIdx}-${colIdx}"><div class="card-body">${details}</div></div></div>`;
  }) || ui.loading("Loading column details...")}`)}` : null;
  renderContent("columns-content", template, "Generating column descriptions...");
}

export function showDbtRuleLoadingIndicator(isLoading) {
  const container = document.getElementById("chat-messages-floating");
  if (!container) return;
  let indicator = document.getElementById("dbt-rule-loading-indicator");
  if (isLoading && !indicator) {
    indicator = document.createElement("div");
    indicator.id = "dbt-rule-loading-indicator";
    indicator.className = "card mb-2";
    render(html`<div class="card-body"><div class="d-flex align-items-center"><div class="spinner-border spinner-border-sm me-2"></div><p class="card-text mb-0">Processing DBT rule changes...</p></div></div>`, indicator);
    container.appendChild(indicator);
    container.scrollTop = container.scrollHeight;
  } else if (!isLoading && indicator) indicator.remove();
}

const createDbtRuleTabs = (rule) => {
  const tableId = rule.tableName.replace(/\s/g, '_');
  const tabs = ['SQL', 'YAML', 'Tests', ...(rule.relationships?.length ? ['Relationships'] : [])];
  return html`<ul class="nav nav-tabs" id="rule-tabs-${tableId}">${tabs.map((tab, i) => html`<li class="nav-item"><button class="nav-link ${i === 0 ? 'active' : ''}" data-bs-toggle="tab" data-bs-target="#${tab.toLowerCase()}-${tableId}">${tab}</button></li>`)}</ul><div class="tab-content mt-3">${ui.tabPane('sql', tableId, rule.modelSql || 'Generating SQL...', true)}${ui.tabPane('yaml', tableId, rule.yamlConfig || 'Generating YAML config...', false)}<div class="tab-pane fade" id="tests-${tableId}">${rule.tests?.length ? ui.table(['Column', 'Tests', 'Relationships'], rule.tests.map(test => html`<tr><td>${test.column}</td><td><ul class="mb-0">${test.tests?.map(t => html`<li>${t}</li>`) || html`<li>Loading tests...</li>`}</ul></td><td>${test.relationships?.length ? html`<ul class="mb-0">${test.relationships.map(rel => html`<li><code>${rel.test}</code> → ${rel.to} (${rel.field})</li>`)}</ul>` : html`<span class="text-muted">None</span>`}</td></tr>`)) : ui.loading("Generating tests...")}${rule.recommendations?.length ? html`<h6 class="mt-3">Model-Specific Recommendations</h6><ul>${rule.recommendations.map(rec => html`<li>${rec}</li>`)}</ul>` : ''}</div>${rule.relationships?.length ? html`<div class="tab-pane fade" id="relationships-${tableId}"><div class="d-flex justify-content-end mb-2"><button class="btn btn-sm btn-outline-secondary copy-btn" data-content-id="relationships-content-${tableId}">${icons.clipboard} Copy</button></div><div id="relationships-content-${tableId}"><h6>Table Relationships</h6>${rule.relationships.map(rel => html`<div class="card mb-2"><div class="card-body"><p><strong>Description:</strong> ${rel.description}</p><h6>Join Logic:</h6><pre><code>${rel.joinLogic}</code></pre></div></div>`)}</div></div>` : ''}</div>`;
};

export function renderDbtRules(dbtRulesData) {
  if (!dbtRulesData?.dbtRules?.length) return renderContent("dbt-content", null, "Generating DBT rules...");
  const summaryContent = dbtRulesData.summary ? (dbtRulesData.summary.includes('- ') || dbtRulesData.summary.includes('* ') ? dbtRulesData.summary : dbtRulesData.summary.replace(/([.!?])\s+/g, "$1\n").split('\n').filter(s => s.trim()).map(s => `- ${s}`).join('\n')) : '';
  const template = html`${summaryContent ? html`<div class="alert alert-primary mb-4"><h5>DBT Rules Summary</h5>${formatChatMessageWithMarked(summaryContent)}</div>` : ''}${dbtRulesData.globalRecommendations?.length ? html`<div class="alert alert-success mb-4"><h6>Global DBT Project Recommendations</h6><ul class="mb-0">${dbtRulesData.globalRecommendations.map(rec => html`<li>${rec}</li>`)}</ul></div>` : ''}<div class="position-fixed top-0 end-0 p-3" style="z-index: 1080"><div id="copyToast" class="toast align-items-center text-white bg-success" role="alert"><div class="d-flex"><div class="toast-body">Content copied to clipboard!</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div></div>${dbtRulesData.dbtRules.map(rule => {
    const matBadge = rule.materialization ? ui.badge(rule.materialization, 'bg-info ms-2') : '';
    return html`<div class="card mb-3"><div class="card-header"><h5 class="mb-0">${rule.tableName}${matBadge}</h5></div><div class="card-body">${createDbtRuleTabs(rule)}</div></div>`;
  })}`;
  renderContent("dbt-content", template);
  setupCopyButtons();
}

const setupCopyButtons = () => {
  const toast = new bootstrap.Toast(document.getElementById('copyToast'), { animation: true, delay: 3000 });
  document.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', () => {
    const element = document.getElementById(btn.getAttribute('data-content-id'));
    if (element) navigator.clipboard.writeText(element.textContent).then(() => toast.show()).catch(err => console.error('Copy failed:', err));
  }));
};

export function renderChatMessage(role, message, useMarked = false) {
  const container = document.getElementById("chat-messages-floating");
  if (!container) return;
  const temp = document.createElement('div');
  render(html`<div class="card mb-2"><div class="card-body ${role === "user" ? "bg-light text-dark" : ""}"><p class="card-text">${useMarked ? formatChatMessageWithMarked(message) : formatChatMessage(message)}</p></div></div>`, temp);
  container.appendChild(temp.firstElementChild);
  container.scrollTop = container.scrollHeight;
}

const formatChatMessage = (message) => unsafeHTML(message.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>'));

export function formatChatMessageWithMarked(message) {
  return message ? unsafeHTML(marked.parse(message)) : '';
}

export function renderRelationships(schemaData) {
  const template = schemaData?.relationships?.length ? html`<h5>Table Relationships</h5>${schemaData.relationships.map(rel => {
    const confidenceClass = rel.confidence === 'high' ? 'success' : rel.confidence === 'medium' ? 'warning' : 'secondary';
    return html`<div class="card mb-3"><div class="card-header d-flex justify-content-between align-items-center"><span><strong>${rel.fromTable}</strong> → <strong>${rel.toTable}</strong></span><div>${ui.badge(rel.relationshipType, 'bg-primary')} ${ui.badge(`${rel.confidence} confidence`, `bg-${confidenceClass}`)}</div></div><div class="card-body"><p><strong>Join:</strong> <code>${rel.fromTable}.${rel.fromColumn}</code> → <code>${rel.toTable}.${rel.toColumn}</code></p><p><strong>Recommended Join Type:</strong> ${ui.badge(rel.joinType.toUpperCase(), 'bg-info')}</p><p>${rel.description || 'No description available'}</p></div></div>`;
  })}` : null;
  renderContent("relationships-content", template, "Analyzing relationships between tables...");
}

export function renderJoinsAndModeling(schemaData) {
  const joinsTemplate = schemaData?.suggestedJoins?.length ? html`<h5>Suggested Join Patterns</h5>${schemaData.suggestedJoins.map(join => html`<div class="card mb-3"><div class="card-header"><h6 class="mb-0">${join.description}</h6></div><div class="card-body"><p><strong>Use Case:</strong> ${join.useCase}</p><p><strong>Tables:</strong> ${join.tables.join(', ')}</p><h6>SQL Pattern:</h6><pre><code>${join.sqlPattern}</code></pre></div></div>`)}` : '';
  const recsTemplate = schemaData?.modelingRecommendations?.length ? html`<h5 class="mt-4">Data Modeling Recommendations</h5><div class="alert alert-success"><ul class="mb-0">${schemaData.modelingRecommendations.map(rec => html`<li>${rec}</li>`)}</ul></div>` : '';
  const template = joinsTemplate || recsTemplate ? html`${joinsTemplate}${recsTemplate}` : null;
  renderContent("joins-content", template, "Analyzing join patterns and modeling recommendations...");
}