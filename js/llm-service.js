import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { generateDbtRules, getDbtRulesSummary, handleDbtRuleChat } from "./dbt-generation.js";
import { loadtxt } from "./utils.js";

let customPrompts = { schema: null, dbtRules: null };
let chatHistory = [];

export { generateDbtRules, getDbtRulesSummary };

export function setCustomPrompts(prompts) {
  if (prompts.schema !== undefined) customPrompts.schema = prompts.schema;
  if (prompts.dbtRules !== undefined) customPrompts.dbtRules = prompts.dbtRules;
}

export async function getCurrentPrompts() {
  return {
    schema: customPrompts.schema || await loadtxt('./prompts/schema-generation.md'),
    dbtRules: customPrompts.dbtRules || await loadtxt('./prompts/dbt-rules-generation.md')
  };
}

export function resetPrompts() {
  customPrompts.schema = null;
  customPrompts.dbtRules = null;
}

export function resetChatHistory() {
  chatHistory = [];
}

export async function generateSchema(fileData, llmConfig, onUpdate, model = "gpt-4.1-mini", globalTableRules = "") {
  try {
    const template = customPrompts.schema || await loadtxt('./prompts/schema-generation.md');
    const sheetsData = fileData.sheets.map(sheet => {
      const randomRows = sheet.sampleRows.slice(0, Math.min(sheet.sampleRows.length, 5));
      const tsvData = randomRows.map(row => 
        row.map(value => String(value || '').replace(/[\t\n]/g, ' ')).join('\t')
      ).join('\n');
      return `\nSheet: ${sheet.name}\nHeaders: ${sheet.headers.join('\t')}\nSample Data (${randomRows.length} rows):\n${tsvData}`;
    }).join('\n');
    
    const prompt = template
      .replace(/\$\{fileData\.name\}/g, fileData.name)
      .replace(/\$\{fileData\.type\}/g, fileData.type)
      .replace(/\$\{fileData\.sheets\}/g, sheetsData)
      .replace(/\$\{globalTableRules\}/g, globalTableRules ? `\n\nGLOBAL TABLE CLASSIFICATION RULES:\n${globalTableRules}\n` : '');

    let fullContent = "";
    for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmConfig.apiKey}` },
      body: JSON.stringify({
        model, stream: true, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a data analysis assistant that generates detailed schema information from tabular data." },
          { role: "user", content: prompt }
        ]
      })
    })) {
      if (error) throw new Error(`LLM API error: ${error}`);
      if (content) {
        fullContent = content;
        try {
          if (onUpdate) onUpdate(parse(fullContent));
        } catch {}
      }
    }
    return JSON.parse(fullContent);
  } catch (error) {
    throw new Error(`Schema generation failed: ${error.message}`);
  }
}

export async function streamChatResponse(context, userMessage, llmConfig, onUpdate, model = "gpt-4.1-mini") {
  try {
    chatHistory.push({ role: "user", content: userMessage });
    
    const isDbtRelated = userMessage.toLowerCase().includes('rule') || userMessage.toLowerCase().includes('dbt');
    let finalResponse;
    
    if (isDbtRelated) {
      const result = await handleDbtRuleChat(context, userMessage, llmConfig, onUpdate, model);
      finalResponse = result.finalResponse;
    } else {
      const systemContent = [
        "You are a helpful assistant specializing in data analysis, schema design, and DBT rules. Answer questions about the uploaded data file, schema, or DBT rules.",
        context.attachedFile && `The user has attached a new file: ${context.attachedFile.name}. Here's the data: ${JSON.stringify(context.attachedFile)}.`,
        (context.fileData || context.schema || context.dbtRules) && `Here's information about the existing data context: ${JSON.stringify({ fileData: context.fileData, schema: context.schema, dbtRules: context.dbtRules })}.`
      ].filter(Boolean).join(" ");
      
      let fullContent = "";
      for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmConfig.apiKey}` },
        body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: systemContent }, ...chatHistory] })
      })) {
        if (error) throw new Error(`LLM API error: ${error}`);
        if (content) {
          fullContent = content;
          if (onUpdate) onUpdate(content);
        }
      }
      finalResponse = fullContent;
    }
    
    chatHistory.push({ role: "assistant", content: finalResponse });
    return finalResponse;
  } catch (error) {
    throw new Error(`Chat response failed: ${error.message}`);
  }
}

