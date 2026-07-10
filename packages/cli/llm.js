import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GLM_API_KEY = process.env.GLM_API_KEY;
const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

if (!GLM_API_KEY) {
  throw new Error('Missing GLM_API_KEY. Set it in packages/cli/.env (see .env.example).');
}

export async function generateScriptAndDiagram(readmeContent, repoName) {
  const prompt = `You are an expert developer advocate. We are making a 3-minute explainer video/podcast for the GitHub repository: ${repoName}.
Here is the README content of the repository:
${readmeContent.substring(0, 10000)} // Truncating to avoid huge payloads

Please generate a JSON object with two fields:
1. "script": A spoken-word script (approx 400 words) with the following structure: Hook, What it does, How it works, One Clever Trick, Outro. Make it engaging, professional, and easy to listen to. Do not include stage directions, just the spoken text.
2. "mermaid": A Mermaid.js diagram definition (graph TD or similar) showing the high-level architecture of how this project works. Just the raw mermaid code, no markdown ticks.

Respond ONLY with valid JSON.`;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: 'glm-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that outputs strictly valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${GLM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    let content = response.data.choices[0].message.content;
    
    // Clean up potential markdown formatting from JSON
    if (content.startsWith('```json')) {
      content = content.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```/, '').replace(/```$/, '').trim();
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('Error calling GLM API:', error.response ? error.response.data : error.message);
    throw new Error('Failed to generate script with AI');
  }
}
