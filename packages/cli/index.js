#!/usr/bin/env node

import { program } from 'commander';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { generateScriptAndDiagram } from './llm.js';

const execAsync = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

program
  .name('readme-radio')
  .description('Turn any GitHub repository into an explainer video')
  .argument('<repository>', 'GitHub repository URL or owner/repo (e.g., pallets/flask)')
  .action(async (repository) => {
    let repoName = repository;
    if (repository.includes('github.com/')) {
      repoName = repository.split('github.com/')[1];
    }

    const spinner = ora(`Analyzing repository: ${repoName}...`).start();

    try {
      // Step 1: Fetch README
      spinner.text = `Fetching README for ${repoName}...`;
      const readmeUrl = `https://raw.githubusercontent.com/${repoName}/main/README.md`;
      let readmeContent = '';
      try {
        const response = await axios.get(readmeUrl);
        readmeContent = response.data;
      } catch (e) {
        // Fallback to master
        const fallbackUrl = `https://raw.githubusercontent.com/${repoName}/master/README.md`;
        const response = await axios.get(fallbackUrl);
        readmeContent = response.data;
      }

      spinner.succeed(`Fetched README for ${repoName}`);
      console.log('README length:', readmeContent.length);

      // Step 2: Generate Script via GLM
      spinner.start('Writing script with AI...');
      const { script, mermaid } = await generateScriptAndDiagram(readmeContent, repoName);
      await fs.writeFile('script.txt', script);
      await fs.writeFile('architecture.mermaid', mermaid);
      spinner.succeed('Script and Mermaid diagram generated');

      // Step 3: Audio Generation via Python Bridge
      spinner.start('Synthesizing voiceover and generating captions...');
      const pythonScriptPath = path.join(__dirname, 'generate_audio.py');
      try {
        await execAsync(`python "${pythonScriptPath}" --input script.txt --output-audio episode.wav --output-srt captions.srt`);
      } catch (err) {
        // Fallback to python3 if python is not available
        await execAsync(`python3 "${pythonScriptPath}" --input script.txt --output-audio episode.wav --output-srt captions.srt`);
      }
      spinner.succeed('Audio and captions ready');

      // Step 4: Render Video
      spinner.start('Rendering video with Remotion...');
      const remotionPath = path.join(__dirname, '../remotion');
      try {
        await execAsync(`npx remotion render src/index.ts Main ../cli/explainer.mp4`, { cwd: remotionPath });
        spinner.succeed('Video rendered successfully!');
      } catch (err) {
        spinner.fail('Error rendering video');
        console.error(err.message);
      }

      console.log(`\nDone! Output saved to: explainer.mp4, episode.mp3, captions.srt`);
    } catch (error) {
      spinner.fail('An error occurred during generation');
      console.error(error.message);
    }
  });

program.parse(process.argv);
