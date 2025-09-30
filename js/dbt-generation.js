// Import libraries
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { loadtxt } from './utils.js';

/**
 * Generate DBT rules from schema using LLM with streaming
 * @param {Object} schemaData - Generated schema information
 * @param {Object} llmConfig - LLM provider configuration
 * @param {Function} onUpdate - Callback function for streaming updates
 * @param {String} model - Model to use (optional, defaults to gpt-4.1-mini)
 * @returns {Object} Generated DBT rules with summary
 */
export async function generateDbtRules(schemaData, llmConfig, onUpdate, model = "gpt-4.1-mini") {
  try {
    const prompt = await createDbtRulesPrompt(schemaData);
    const result = await streamLLMResponse(llmConfig, {
      system: "You are a DBT expert that generates high-quality DBT rules and tests based on schema information.",
      user: prompt,
      model,
      responseFormat: { type: "json_object" }
    }, onUpdate);
    
    if (!result.summary && result.globalRecommendations) {
      result.summary = result.globalRecommendations.join("\n\n");
    }
    
    return result;
  } catch (error) {
    throw new Error(`DBT rules generation failed: ${error.message}`);
  }
}

/**
 * Handle chat response for DBT rule modifications
 * @param {Object} context - Data context including current rules
 * @param {String} userMessage - User's message
 * @param {Object} llmConfig - LLM provider configuration
 * @param {Function} onUpdate - Update callback for streaming
 * @returns {Object} - Contains finalResponse and any updated rules
 */
export async function handleDbtRuleChat(context, userMessage, llmConfig, onUpdate, model = "gpt-4.1-mini") {
  try {
    const systemPrompt = await createChatSystemPrompt(context);
    let fullContent = "";
    let isDbtRuleResponse = false;
    
    for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }]
      })
    })) {
      if (error) throw new Error(`LLM API error: ${error}`);
      
      if (content) {
        fullContent = content;
        if (fullContent.includes("DBT_RULE_JSON:")) {
          isDbtRuleResponse = true;
          onUpdate?.("Generating DBT rule modifications...");
        } else {
          onUpdate?.(content);
        }
      }
    }
    
    return await processLLMResponse(fullContent, isDbtRuleResponse, context.dbtRules);
  } catch (error) {
    throw new Error(`Chat response failed: ${error.message}`);
  }
}

/**
 * Process DBT rule changes and apply them to the current rules
 * @param {Object} currentRules - Current DBT rules
 * @param {Object} changes - Changes to apply
 * @returns {Object} Object containing response message and updated rules
 */
async function processRuleChanges(currentRules, changes) {
  if (!currentRules?.dbtRules) {
    return {
      response: "Error: No existing DBT rules found. Please generate DBT rules first.",
      updatedRules: null
    };
  }
  
  try {
    const updatedRules = JSON.parse(JSON.stringify(currentRules));
    const changeLog = { added: [], modified: [], lastModifiedTable: "" };
    
    // Process DBT rule changes
    if (changes.dbtRules) {
      for (const newRule of changes.dbtRules) {
        const existingIndex = updatedRules.dbtRules.findIndex(r => r.tableName === newRule.tableName);
        const isNewRule = newRule.isNewRule === true || existingIndex === -1;
        
        if (existingIndex >= 0 && !isNewRule) {
          Object.assign(updatedRules.dbtRules[existingIndex], newRule);
          changeLog.modified.push(`Modified rule for table '${newRule.tableName}'`);
          changeLog.lastModifiedTable = newRule.tableName;
        } else {
          if (isNewRule && existingIndex >= 0 && !newRule.tableName.includes("_new") && !newRule.tableName.includes("_additional")) {
            newRule.tableName = `${newRule.tableName}_additional`;
          }
          delete newRule.isNewRule;
          updatedRules.dbtRules.push(newRule);
          changeLog.added.push(`Added new rule for table '${newRule.tableName}'`);
          changeLog.lastModifiedTable = newRule.tableName;
        }
      }
    }
    
    // Process other updates
    if (changes.globalRecommendations) {
      updatedRules.globalRecommendations = changes.globalRecommendations;
      changeLog.modified.push("Updated global recommendations");
    }
    if (changes.summary) {
      updatedRules.summary = changes.summary;
      changeLog.modified.push("Updated summary");
    }
    
    // Format response
    let response = "### DBT Rules Updated\n\n";
    if (changeLog.added.length) response += "**Added:**\n" + changeLog.added.map(i => `- ${i}`).join('\n') + "\n\n";
    if (changeLog.modified.length) response += "**Modified:**\n" + changeLog.modified.map(i => `- ${i}`).join('\n') + "\n\n";
    
    response += "\n\n<!-- UPDATED_DBT_RULES:" + JSON.stringify(updatedRules) + " -->";
    response += "\n\n<!-- LAST_MODIFIED_TABLE:" + changeLog.lastModifiedTable + " -->";
    
    return { response, updatedRules };
  } catch (error) {
    return {
      response: `Error processing rule changes: ${error.message}`,
      updatedRules: null
    };
  }
}

/**
 * Stream LLM response with common configuration
 * @param {Object} llmConfig - LLM configuration
 * @param {Object} options - Request options
 * @param {Function} onUpdate - Update callback
 * @returns {Object} Parsed response
 */
async function streamLLMResponse(llmConfig, options, onUpdate) {
  let fullContent = "";
  const body = {
    model: options.model,
    stream: true,
    messages: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
    ...(options.responseFormat && { response_format: options.responseFormat })
  };

  for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmConfig.apiKey}` },
    body: JSON.stringify(body)
  })) {
    if (error) throw new Error(`LLM API error: ${error}`);
    if (content) {
      fullContent = content;
      try {
        const parsedContent = parse(fullContent);
        onUpdate?.(parsedContent);
      } catch (parseError) {
        // Ignore parse errors for partial content
      }
    }
  }
  
  return JSON.parse(fullContent);
}

/**
 * Create DBT rules generation prompt
 * @param {Object} schemaData - Schema data
 * @returns {Promise<string>} Formatted prompt
 */
async function createDbtRulesPrompt(schemaData) {
  const template = await loadtxt('./prompts/dbt-rules-generation.md');
  return template.replace(/\$\{schemaData\}/g, JSON.stringify(schemaData));
}

/**
 * Create chat system prompt
 * @param {Object} context - Context data
 * @returns {Promise<string>} System prompt
 */
async function createChatSystemPrompt(context) {
  const template = await loadtxt('./prompts/dbt-chat-system.md');
  return template.replace(/\$\{context\}/g, JSON.stringify(context));
}

/**
 * Process LLM response for chat functionality
 * @param {string} fullContent - Full response content
 * @param {boolean} isDbtRuleResponse - Whether response contains DBT rules
 * @param {Object} currentRules - Current DBT rules
 * @returns {Object} Processed response
 */
async function processLLMResponse(fullContent, isDbtRuleResponse, currentRules) {
  let finalResponse = fullContent;
  let updatedRules = null;
  
  if (isDbtRuleResponse) {
    try {
      const jsonMatch = fullContent.match(/DBT_RULE_JSON:\s*(\{[\s\S]*\})/m);
      if (jsonMatch?.[1]) {
        const ruleChanges = JSON.parse(jsonMatch[1]);
        const processResult = await processRuleChanges(currentRules, ruleChanges);
        finalResponse = processResult.response;
        updatedRules = processResult.updatedRules;
      }
    } catch (error) {
      finalResponse = `Error processing DBT rule changes: ${error.message}. Here's the raw response:\n\n${fullContent}`;
    }
  }
  
  return { finalResponse, updatedRules };
}

/**
 * Extract summary from DBT rules
 * @param {Object} dbtRules - Generated DBT rules
 * @returns {String} Summary of DBT rules
 */
export function getDbtRulesSummary(dbtRules) {
  return dbtRules?.globalRecommendations?.join("\n\n") || "No DBT rules summary available.";
}