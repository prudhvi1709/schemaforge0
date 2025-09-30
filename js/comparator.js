import { render, html } from "lit-html";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";

// System prompts
const SYSTEM_PROMPTS = {
    columnMapping: `You are a data analyst expert. Analyze two datasets and create column mappings between them.
Your task:
1. Identify which columns from Dataset A correspond to columns in Dataset B (even if names are different). 
2. Provide common names for mapped columns
3. **Very IMPORTANT: datatypes must be same for both the mapping columns.**
3. Identify column data types and context
4. **IMPORTANT: Identify date columns - these often appear as Excel serial numbers (like 45932, 45898) or date strings**
5. Suggest which columns are suitable for SUM aggregation and COUNT aggregation

**Date Detection Rules:**
- Numbers like 45932, 45898, 44927 are Excel date serial numbers
- Column names containing "date", "time", "created", "updated" are likely dates
- Values that look like dates (YYYY-MM-DD, MM/DD/YYYY) are dates

Return ONLY a valid JSON object with this exact structure:
{
  "mappings": [
    {
      "dataset1_column": "column_name_from_dataset1",
      "dataset2_column": "column_name_from_dataset2",
      "common_name": "unified_column_name",
      "data_type": "string|number|date|boolean",
      "description": "what this column represents",
      "suitable_for_sum": false,
      "suitable_for_count": true,
      "is_excel_date_serial": true
    }
  ],
  "dataset1_only": ["column1", "column2"],
  "dataset2_only": ["column3", "column4"],
  "suggested_grouping_columns": ["common_name1", "common_name2"],
  "suggested_sum_columns": ["common_name3"],
  "suggested_count_columns": ["common_name1", "common_name4"],
  "date_columns": {
    "dataset1": ["column_name"],
    "dataset2": ["column_name"],
    "mapped": ["common_name"]
  }
}`,

    discrepancyAnalysis: (hasMismatch) => hasMismatch ?
        `You are a data analyst expert. Analyze the differences between two datasets for a specific group and explain why there are discrepancies.
Provide a clear, concise analysis in 2-3 sentences explaining:
1. What specific differences you observe
2. Possible reasons for the discrepancies
3. Recommendations for investigation
Focus on data quality issues, missing records, calculation differences, or data processing problems.` :
        `You are a data analyst expert. Analyze two datasets for a specific group that show matching aggregated values.
Provide a clear, concise summary in 2-3 sentences explaining:
1. What data consistency you observe
2. What this matching data indicates about data quality
3. Any insights about the data patterns
Focus on data quality validation and consistency indicators.`
};

// Utility functions
const $ = (id) => document.getElementById(id);
const showElements = (...ids) => ids.forEach(id => $(id)?.classList.remove("d-none"));
const hideElements = (...ids) => ids.forEach(id => $(id)?.classList.add("d-none"));

// Date conversion utilities
const excelToDate = (num) => new Date(new Date(1899, 11, 30).getTime() + (num * 86400000));

const formatExcelDate = (value) => {
    try {
        if (typeof value === 'number' && value > 1 && value < 100000) {
            return excelToDate(value).toLocaleDateString();
        }
    } catch (e) { }
    return value;
};

// Rendering utilities
const renderCheckboxGroup = (columns, className, idPrefix) => columns.map(col => html`
    <div class="form-check">
        <input class="form-check-input ${className}" type="checkbox" id="${idPrefix}-${col}" value="${col}">
        <label class="form-check-label" for="${idPrefix}-${col}">${col}</label>
    </div>
`);

const renderDrillTable = (rows, title) => html`
    <div class="col-md-6">
        <h6>${title} (${rows.length} rows)</h6>
        <div class="table-responsive" style="max-height: 300px;">
            <table class="table table-sm">
                <thead>
                    <tr>${rows.length ? Object.keys(rows[0]).map(col => html`<th>${col}</th>`) : html`<th>No data</th>`}</tr>
                </thead>
                <tbody>
                    ${rows.map(row => html`<tr>${Object.values(row).map(val => html`<td>${val}</td>`)}</tr>`)}
                </tbody>
            </table>
        </div>
    </div>
`;

const renderLoadingSpinner = (message = "Processing...") => html`
    <div class="d-flex justify-content-center">
        <div class="spinner-border text-primary" role="status"></div>
        <span class="ms-2">${message}</span>
    </div>
`;

// Data processing utilities
const getSampleData = (data) => !data?.length ? { columns: [], rows: [] } :
    { columns: Object.keys(data[0]), rows: data.slice(0, 10) };

const processFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            if (workbook.SheetNames.length < 2) throw new Error('File must contain at least 2 sheets/tabs');
            const [sheet1Name, sheet2Name] = workbook.SheetNames;
            const tabData = {
                tab1: XLSX.utils.sheet_to_json(workbook.Sheets[sheet1Name]),
                tab2: XLSX.utils.sheet_to_json(workbook.Sheets[sheet2Name])
            };
            const tabNames = {
                tab1: sheet1Name,
                tab2: sheet2Name
            };
            resolve({ tabData, tabNames });
        } catch (error) {
            reject(error);
        }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
});

const applyColumnMapping = (data, columnMapping, isDataset1 = true) => {
    if (!columnMapping || !data.length) return data;
    return data.map(row => {
        const mappedRow = {};
        columnMapping.mappings.forEach(mapping => {
            const sourceCol = isDataset1 ? mapping.dataset1_column : mapping.dataset2_column;
            if (sourceCol && row.hasOwnProperty(sourceCol)) {
                let value = row[sourceCol];
                if (mapping.data_type === 'date' || mapping.is_excel_date_serial) {
                    value = formatExcelDate(value);
                }
                mappedRow[mapping.common_name] = value;
            }
        });
        return mappedRow;
    });
};

const calculateSummaries = (data, groupingKeys, sumColumns, countColumns) => {
    if (!data?.length) return [];
    const groups = {};
    data.forEach(row => {
        const groupKey = groupingKeys.length ? groupingKeys.map(key => String(row[key] || '')).join('|') : 'Total';
        if (!groups[groupKey]) {
            groups[groupKey] = { group: groupKey, sums: {}, counts: {}, count: 0, rows: [] };
            sumColumns.forEach(col => groups[groupKey].sums[col] = 0);
            countColumns.forEach(col => groups[groupKey].counts[col] = 0);
        }
        sumColumns.forEach(col => {
            if (row[col] && !isNaN(parseFloat(row[col]))) {
                groups[groupKey].sums[col] += parseFloat(row[col]);
            }
        });
        countColumns.forEach(col => {
            if (row[col] != null && row[col] !== '') {
                groups[groupKey].counts[col]++;
            }
        });
        groups[groupKey].count++;
        groups[groupKey].rows.push(row);
    });
    return Object.values(groups);
};

// Main Comparator class
export class DataComparator {
    constructor() {
        this.tabData = { tab1: null, tab2: null };
        this.tabNames = { tab1: '', tab2: '' };
        this.columnMapping = null;
        this.selectedGroupingKeys = [];
        this.selectedSumColumns = [];
        this.selectedCountColumns = [];
        this.provider = null;
        this.currentModel = "gpt-4.1-mini";
        
        this.initEventListeners();
        this.updateFileStatus();
    }

    initEventListeners() {
        const fileInput = $('comparator-file-input');
        const analyzeNewFileBtn = $('btn-analyze-new-file');
        const compareBtn = $('btn-compare-summary-comparator');
        const useExistingBtn = $('btn-use-existing-data');
        const uploadNewBtn = $('btn-upload-new-file');
        const newFileUploadDiv = $('new-file-upload');

        // Handle file input changes
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (analyzeNewFileBtn) analyzeNewFileBtn.disabled = !e.target.files.length;
            });
        }

        // Handle analyze new file button
        if (analyzeNewFileBtn) {
            analyzeNewFileBtn.addEventListener('click', () => this.analyzeNewFile());
        }

        // Handle use existing data button
        if (useExistingBtn) {
            useExistingBtn.addEventListener('click', () => this.useExistingData());
        }

        // Handle upload new file button (toggle UI)
        if (uploadNewBtn) {
            uploadNewBtn.addEventListener('click', () => {
                if (newFileUploadDiv) {
                    newFileUploadDiv.classList.toggle('d-none');
                }
            });
        }

        // Handle compare summaries button
        if (compareBtn) {
            compareBtn.addEventListener('click', () => this.compareSummaries());
        }
    }

    updateFileStatus() {
        const statusDiv = $('comparator-file-status');
        if (!statusDiv) return;

        const existingFileData = window.currentFileData;
        
        if (existingFileData && existingFileData._originalFileContent) {
            try {
                // Check if the existing file has multiple sheets
                const workbook = XLSX.read(existingFileData._originalFileContent, { type: 'array' });
                const hasMultipleSheets = workbook.SheetNames.length >= 2;
                
                const template = html`
                    <div class="alert ${hasMultipleSheets ? 'alert-success' : 'alert-warning'}">
                        <i class="bi bi-${hasMultipleSheets ? 'check-circle' : 'exclamation-triangle'} me-2"></i>
                        <strong>Current file loaded:</strong> ${workbook.SheetNames.length} sheet(s) available
                        ${hasMultipleSheets ? 
                            html`<br><small>Sheets: ${workbook.SheetNames.join(', ')}</small>` : 
                            html`<br><small>Multiple sheets required for comparison</small>`
                        }
                    </div>
                `;
                render(template, statusDiv);
            } catch (error) {
                render(html`
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Current file cannot be processed for comparison. Please upload a new Excel file.
                    </div>
                `, statusDiv);
            }
        } else {
            render(html`
                <div class="alert alert-info">
                    <i class="bi bi-info-circle me-2"></i>
                    No file currently loaded in SchemaForge. Upload a file first or use the 'Upload New File' option.
                </div>
            `, statusDiv);
        }
    }

    async initLLM(show = false) {
        try {
            // Try to use existing LLM config from main SchemaForge if available
            if (window.getLLMConfig && window.getLLMConfig()) {
                const mainConfig = window.getLLMConfig();
                this.provider = { baseUrl: mainConfig.baseUrl, apiKey: mainConfig.apiKey };
                return;
            }
            
            // Otherwise, configure independently
            const cfg = await openaiConfig({
                title: "LLM Configuration for Data Mismatch Detection",
                defaultBaseUrls: ["https://api.openai.com/v1", "https://openrouter.ai/api/v1"],
                show,
            });
            this.provider = { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey };
        } catch (e) {
            this.showAlert(`Failed to configure LLM: ${e.message}`, "danger");
        }
    }

    showAlert(message, type = "info") {
        // Integrate with SchemaForge's alert system
        if (window.updateStatus) {
            window.updateStatus(message, type);
        } else {
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }

    async getColumnMapping() {
        if (!this.provider) {
            await this.initLLM();
            if (!this.provider) throw new Error("LLM not configured");
        }
        
        const [sample1, sample2] = [getSampleData(this.tabData.tab1), getSampleData(this.tabData.tab2)];
        
        const userPrompt = `Dataset A (${this.tabNames.tab1}):
Columns: ${sample1.columns.join(', ')}
Sample Data:
${JSON.stringify(sample1.rows, null, 2)}

Dataset B (${this.tabNames.tab2}):
Columns: ${sample2.columns.join(', ')}
Sample Data:
${JSON.stringify(sample2.rows, null, 2)}

Create column mappings and analysis. Pay special attention to identifying date columns that may appear as Excel serial numbers.`;

        try {
            const response = await fetch(`${this.provider.baseUrl}/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.provider.apiKey}` },
                body: JSON.stringify({
                    model: this.currentModel,
                    messages: [
                        {role:"system",content: SYSTEM_PROMPTS.columnMapping},
                        {role:"user",content:userPrompt},
                    ],
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
            const content = data.choices[0].message.content.trim();
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("No valid JSON found in LLM response");
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error("LLM Error:", error);
            throw new Error(`LLM analysis failed: ${error.message}`);
        }
    }

    renderMetadata() {
        const mappedColumns = this.columnMapping.mappings.filter(mapping =>
            mapping.dataset1_column && mapping.dataset2_column
        );
        const template = html`
            <h6>Mapped Columns (Present in Both Sheets)</h6>
            <div class="table-responsive mb-3">
                <table class="table table-sm">
                    <thead>
                        <tr><th>${this.tabNames.tab1}</th><th>${this.tabNames.tab2}</th><th>Common Name</th><th>Type</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                        ${mappedColumns.map(mapping => html`
                            <tr class="match ${mapping.data_type === 'date' || mapping.is_excel_date_serial ? 'table-warning' : ''}">
                                <td>${mapping.dataset1_column}</td>
                                <td>${mapping.dataset2_column}</td>
                                <td><strong>${mapping.common_name}</strong> ${mapping.data_type === 'date' ? '📅' : ''}</td>
                                <td>${mapping.data_type}</td>
                                <td>${mapping.description}</td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
            <div class="row">
            <div class="col-md-4">
                <div class="card match">
                <div class="card-body text-center">
                    <h5>${mappedColumns.length}</h5>
                    <small class="text-muted">Mapped Columns</small>
                </div>
                </div>
            </div>
            </div>
            <h6 class="mt-3">Row Count Comparison</h6>
            <div class="row">
                ${[this.tabNames.tab1, this.tabNames.tab2, 'Match'].map((label, idx) => {
                    const count = idx === 0 ? this.tabData.tab1.length :
                                 idx === 1 ? this.tabData.tab2.length :
                                 (this.tabData.tab1.length === this.tabData.tab2.length ? '✅' : '❌');
                    const isMatch = label === 'Match';
                    return html`
                        <div class="col-md-4">
                            <div class="card ${isMatch ? (this.tabData.tab1.length === this.tabData.tab2.length ? 'match' : 'mismatch') : ''}">
                                <div class="card-body text-center">
                                    <h5>${count}</h5>
                                    <small class="text-muted">${label}</small>
                                </div>
                            </div>
                        </div>
                    `;
                })}
            </div>
        `;
        render(template, $('metadata-results-comparator'));
    }

    renderAggregationControls() {
        const mappedCommonNames = this.columnMapping.mappings
            .filter(mapping => mapping.dataset1_column && mapping.dataset2_column)
            .map(mapping => mapping.common_name);
        const filterMappedColumns = (suggestedColumns) =>
            (suggestedColumns || []).filter(col => mappedCommonNames.includes(col));

        const template = html`
            <div class="alert alert-info mb-3">
                <i class="bi bi-info-circle me-1"></i>
                Select columns for grouping and aggregation (only showing mapped columns present in both sheets)
            </div>
            <div class="row mb-3">
                <div class="col-md-4">
                    <label class="form-label fw-bold">Grouping Columns:</label>
                    ${renderCheckboxGroup(filterMappedColumns(this.columnMapping.suggested_grouping_columns), 'grouping-key-comparator', 'group')}
                </div>
                <div class="col-md-4">
                    <label class="form-label fw-bold">Sum Columns:</label>
                    ${renderCheckboxGroup(filterMappedColumns(this.columnMapping.suggested_sum_columns), 'sum-column-comparator', 'sum')}
                </div>
                <div class="col-md-4">
                    <label class="form-label fw-bold">Count Columns:</label>
                    ${renderCheckboxGroup(filterMappedColumns(this.columnMapping.suggested_count_columns), 'count-column-comparator', 'count')}
                </div>
            </div>
        `;
        render(template, $('grouping-keys-comparator'));
    }

    compareSummaries() {
        this.selectedGroupingKeys = Array.from(document.querySelectorAll('.grouping-key-comparator:checked')).map(cb => cb.value);
        this.selectedSumColumns = Array.from(document.querySelectorAll('.sum-column-comparator:checked')).map(cb => cb.value);
        this.selectedCountColumns = Array.from(document.querySelectorAll('.count-column-comparator:checked')).map(cb => cb.value);
        
        if (this.selectedSumColumns.length === 0 && this.selectedCountColumns.length === 0) {
            this.showAlert("Please select at least one sum or count column", "warning");
            return;
        }
        
        const [mappedData1, mappedData2] = [
            applyColumnMapping(this.tabData.tab1, this.columnMapping, true), 
            applyColumnMapping(this.tabData.tab2, this.columnMapping, false)
        ];
        
        const [summary1, summary2] = [
            calculateSummaries(mappedData1, this.selectedGroupingKeys, this.selectedSumColumns, this.selectedCountColumns),
            calculateSummaries(mappedData2, this.selectedGroupingKeys, this.selectedSumColumns, this.selectedCountColumns)
        ];
        
        const allGroups = [...new Set([...summary1.map(s => s.group), ...summary2.map(s => s.group)])];
        const comparison = allGroups.map(group => {
            const s1 = summary1.find(s => s.group === group) || { sums: {}, counts: {}, count: 0, rows: [] };
            const s2 = summary2.find(s => s.group === group) || { sums: {}, counts: {}, count: 0, rows: [] };
            
            [...this.selectedSumColumns, ...this.selectedCountColumns].forEach(col => {
                if (!s1.sums[col]) s1.sums[col] = 0;
                if (!s2.sums[col]) s2.sums[col] = 0;
                if (!s1.counts[col]) s1.counts[col] = 0;
                if (!s2.counts[col]) s2.counts[col] = 0;
            });
            
            let hasMismatch = false;
            this.selectedSumColumns.forEach(col => {
                if (Math.abs(s1.sums[col] - s2.sums[col]) > 0.01) hasMismatch = true;
            });
            this.selectedCountColumns.forEach(col => {
                if (s1.counts[col] !== s2.counts[col]) hasMismatch = true;
            });
            
            return {
                group, tab1Sums: s1.sums, tab2Sums: s2.sums, tab1Counts: s1.counts, tab2Counts: s2.counts,
                hasMismatch, tab1Rows: s1.rows, tab2Rows: s2.rows
            };
        });
        
        this.renderSummaryComparison(comparison);
    }

    renderSummaryComparison(comparison) {
        const template = html`
            <h6>Summary Comparison ${this.selectedGroupingKeys.length ? `(Grouped by: ${this.selectedGroupingKeys.join(', ')})` : '(Overall Total)'}</h6>
            <div class="table-responsive">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Group</th>
                            ${this.selectedSumColumns.map(col => html`<th>${this.tabNames.tab1} ${col} (Sum)</th><th>${this.tabNames.tab2} ${col} (Sum)</th>`)}
                            ${this.selectedCountColumns.map(col => html`<th>${this.tabNames.tab1} ${col} (Count)</th><th>${this.tabNames.tab2} ${col} (Count)</th>`)}
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${comparison.map(comp => html`
                            <tr class="${comp.hasMismatch ? 'mismatch clickable-row' : 'match clickable-row'}" @click=${() => this.drillDown(comp)}>
                                <td>${comp.group}</td>
                                ${this.selectedSumColumns.map(col => html`<td>${(comp.tab1Sums[col] || 0).toFixed(2)}</td><td>${(comp.tab2Sums[col] || 0).toFixed(2)}</td>`)}
                                ${this.selectedCountColumns.map(col => html`<td>${comp.tab1Counts[col] || 0}</td><td>${comp.tab2Counts[col] || 0}</td>`)}
                                <td>${comp.hasMismatch ? '❌ Mismatch' : '✅ Match'}</td>
                            </tr>
                        `)}
                    </tbody>
                </table>
            </div>
            <div class="alert alert-info mt-3">
                <i class="bi bi-info-circle me-1"></i>
                Click on any row to drill down and see detailed data
            </div>
        `;
        render(template, $('summary-results-comparator'));
    }

    async analyzeDiscrepancy(summaryItem) {
        if (!this.provider) {
            await this.initLLM();
            if (!this.provider) throw new Error("LLM not configured");
        }
        
        const userPrompt = `Group: ${summaryItem.group}
Dataset 1 (${this.tabNames.tab1}) - ${summaryItem.tab1Rows.length} rows:
Sum Values: ${JSON.stringify(summaryItem.tab1Sums)}
Count Values: ${JSON.stringify(summaryItem.tab1Counts)}
Sample Data: ${JSON.stringify(summaryItem.tab1Rows.slice(0, 5), null, 2)}

Dataset 2 (${this.tabNames.tab2}) - ${summaryItem.tab2Rows.length} rows:
Sum Values: ${JSON.stringify(summaryItem.tab2Sums)}
Count Values: ${JSON.stringify(summaryItem.tab2Counts)}
Sample Data: ${JSON.stringify(summaryItem.tab2Rows.slice(0, 5), null, 2)}

${summaryItem.hasMismatch ? 'Analyze why these datasets show different aggregated values for this group.' : 'Analyze the consistency and patterns in these matching datasets for this group.'}`;

        try {
            const response = await fetch(`${this.provider.baseUrl}/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.provider.apiKey}` },
                body: JSON.stringify({
                    model: this.currentModel,
                    messages: [
                        {role:"system",content: SYSTEM_PROMPTS.discrepancyAnalysis(summaryItem.hasMismatch)},
                        {role:"user",content:userPrompt }
                    ]
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
            return data.choices[0].message.content.trim();
        } catch (error) {
            console.error("LLM Analysis Error:", error);
            return `Analysis failed: ${error.message}`;
        }
    }

    async drillDown(summaryItem) {
        render(html`
            <div class="mt-4 p-3 border rounded">
                <h6>Drill-Down: ${summaryItem.group}</h6>
                ${renderLoadingSpinner("AI is analyzing the data...")}
            </div>
        `, $('drill-down-results-comparator'));
        
        try {
            const analysis = await this.analyzeDiscrepancy(summaryItem);
            render(html`
                <div class="mt-4 p-3 border rounded">
                    <h6>Drill-Down: ${summaryItem.group}</h6>
                    <div class="alert ${summaryItem.hasMismatch ? 'alert-warning' : 'alert-success'} mb-3">
                        <h6><i class="bi bi-robot me-1"></i>AI Analysis</h6>
                        <p class="mb-0">${analysis}</p>
                    </div>
                    <div class="row">
                        ${renderDrillTable(summaryItem.tab1Rows, this.tabNames.tab1)}
                        ${renderDrillTable(summaryItem.tab2Rows, this.tabNames.tab2)}
                    </div>
                </div>
            `, $('drill-down-results-comparator'));
        } catch (error) {
            render(html`
                <div class="mt-4 p-3 border rounded">
                    <h6>Drill-Down: ${summaryItem.group}</h6>
                    <div class="alert alert-danger">
                        <i class="bi bi-exclamation-triangle me-1"></i>
                        Failed to analyze data: ${error.message}
                    </div>
                </div>
            `, $('drill-down-results-comparator'));
        }
    }

    async useExistingData() {
        try {
            // Check if we have existing file data from SchemaForge
            const existingFileData = window.currentFileData;
            if (!existingFileData || !existingFileData._originalFileContent) {
                this.showAlert("No file data found. Please upload a file in SchemaForge first, or use the 'Upload New File' option.", "warning");
                return;
            }

            this.showAlert("Processing existing file data...", "info");
            
            // Process the existing file to extract multiple sheets
            const result = await this.processExistingFile(existingFileData._originalFileContent);
            if (result.tabData.tab1 && result.tabData.tab2) {
                this.tabData = result.tabData;
                this.tabNames = result.tabNames;
                
                this.showAlert("Analyzing with AI...", "info");
                this.columnMapping = await this.getColumnMapping();
                
                this.renderMetadata();
                showElements('metadata-section-comparator');
                this.renderAggregationControls();
                showElements('summary-section-comparator');
                
                this.showAlert("AI analysis complete using existing data!", "success");
            } else {
                this.showAlert("The existing file doesn't have multiple sheets for comparison. Please upload an Excel file with at least 2 sheets.", "warning");
            }
        } catch (error) {
            this.showAlert(`Error processing existing data: ${error.message}`, "danger");
        }
    }

    async processExistingFile(fileContent) {
        try {
            // Convert file content to workbook
            const workbook = XLSX.read(fileContent, { type: 'array' });
            if (workbook.SheetNames.length < 2) {
                throw new Error('File must contain at least 2 sheets/tabs for comparison');
            }
            
            const [sheet1Name, sheet2Name] = workbook.SheetNames;
            const tabData = {
                tab1: XLSX.utils.sheet_to_json(workbook.Sheets[sheet1Name]),
                tab2: XLSX.utils.sheet_to_json(workbook.Sheets[sheet2Name])
            };
            const tabNames = {
                tab1: sheet1Name,
                tab2: sheet2Name
            };
            return { tabData, tabNames };
        } catch (error) {
            throw new Error(`Failed to process existing file: ${error.message}`);
        }
    }

    async analyzeNewFile() {
        const file = $('comparator-file-input').files[0];
        if (!file) {
            this.showAlert("Please select a file", "warning");
            return;
        }
        
        const btn = $('btn-analyze-new-file');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';
        
        try {
            const result = await processFile(file);
            this.tabData = result.tabData;
            this.tabNames = result.tabNames;
            
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Analyzing with AI...';
            this.columnMapping = await this.getColumnMapping();
            
            this.renderMetadata();
            showElements('metadata-section-comparator');
            this.renderAggregationControls();
            showElements('summary-section-comparator');
            
            this.showAlert("AI analysis complete! Date columns automatically detected and converted.", "success");
        } catch (error) {
            this.showAlert(`Error: ${error.message}`, "danger");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-play-circle me-2"></i>Analyze New File';
        }
    }
}

// DataComparator is already exported above as export class
