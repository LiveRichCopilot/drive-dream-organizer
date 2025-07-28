import { claudeAgent } from './ClaudeAgent';
import { geminiAgent } from './GeminiAgent';
import { gpt4Agent } from './GPT4Agent';
import { openAIVisionAgent } from './OpenAIVisionAgent';

export class MultiAgentSystem {
  private agents = {
    orchestrator: claudeAgent,
    vision: geminiAgent,
    technical: gpt4Agent,
    fallbackVision: openAIVisionAgent
  };

  async processFiles(files: any[], options: any) {
    console.log('Multi-Agent System Activated');
    
    // Step 1: Orchestrator creates execution plan
    const executionPlan = await this.agents.orchestrator.analyze({
      task: 'organize_files',
      fileCount: files.length,
      fileTypes: this.detectFileTypes(files),
      userPreferences: options
    });

    // Step 2: Parallel agent processing
    const agentTasks = [];

    // Vision agents work on images/videos
    const mediaFiles = files.filter(f => this.isMediaFile(f));
    if (mediaFiles.length > 0) {
      agentTasks.push(
        this.agents.vision.batchAnalyze(mediaFiles)
          .catch(() => this.agents.fallbackVision.analyze(mediaFiles))
      );
    }

    // Technical agent handles metadata
    agentTasks.push(
      this.agents.technical.extractAllMetadata(files)
    );

    // Wait for all agents
    const results = await Promise.all(agentTasks);

    // Step 3: Consensus building
    const consensus = await this.buildConsensus(results);

    // Step 4: Execute with monitoring
    return await this.executeWithMonitoring(consensus);
  }

  private async buildConsensus(agentResults: any[]) {
    // Agents vote on best organization strategy
    const proposals = await Promise.all([
      this.agents.orchestrator.proposeStructure(agentResults),
      this.agents.technical.proposeOptimizations(agentResults),
      this.agents.vision.proposeCategorization(agentResults)
    ]);

    // Weighted voting based on agent expertise
    return this.weightedConsensus(proposals);
  }

  private async executeWithMonitoring(plan: any) {
    // All agents monitor execution
    const monitors = [
      this.agents.orchestrator.monitor(),
      this.agents.technical.watchPerformance(),
      this.agents.vision.validateResults()
    ];

    // Execute plan with real-time monitoring
    const execution = this.executePlan(plan);

    // If any agent detects issues, they can intervene
    await Promise.race([execution, ...monitors]);

    return execution;
  }

  private detectFileTypes(files: any[]): string[] {
    return files.map(file => {
      const ext = file.name?.toLowerCase().split('.').pop() || '';
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
      if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
      return 'other';
    });
  }

  private isMediaFile(file: any): boolean {
    const mediaTypes = ['image', 'video'];
    const fileType = this.detectFileTypes([file])[0];
    return mediaTypes.includes(fileType);
  }

  private weightedConsensus(proposals: any[]): any {
    // Simple consensus logic - can be enhanced
    return proposals[0]; // For now, prioritize orchestrator
  }

  private async executePlan(plan: any): Promise<any> {
    // Execute the agreed-upon plan
    return plan;
  }
}

export const multiAgentSystem = new MultiAgentSystem();