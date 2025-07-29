#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';

import Logger from './utils/logger.js';
import NextBillionClient from './api/nextBillionClient.js';

// Load environment variables
dotenv.config();

class JobRemovalScript {
  constructor(options = {}) {
    this.options = {
      maxPasses: 10,
      delayBetweenRequests: 10000, // 10 seconds
      inputFile: './input_southern.json',
      outputDir: './job_removal_output',
      initialJobRemovalCount: 200, // Start by removing 200 jobs at once
      ...options
    };

    this.apiClient = new NextBillionClient(
      process.env.NEXTBILLION_API_KEY || 'mock_key',
      process.env.NEXTBILLION_API_URL
    );

    this.removedJobs = [];
    this.successfulJobs = [];
    this.totalAttempts = 0;
    this.successfulRequest = null;
  }

  async run() {
    try {
      Logger.info('Starting Job Removal Script');
      Logger.info(`Input file: ${this.options.inputFile}`);
      Logger.info(`Max passes: ${this.options.maxPasses}`);
      Logger.info(`Delay between requests: ${this.options.delayBetweenRequests / 1000} seconds`);

      // Step 1: Load input data
      const inputData = await this.loadInputData();
      Logger.info(`Loaded input with ${inputData.jobs?.length || 0} jobs and ${inputData.vehicles?.length || 0} vehicles`);

      // Step 2: Create output directory
      await this.createOutputDirectory();

      // Step 3: Start iterative job removal process
      await this.runJobRemovalProcess(inputData);

      // Step 4: Generate final report
      await this.generateFinalReport();

      Logger.success('Job removal script completed successfully');
      return this.successfulRequest;

    } catch (error) {
      Logger.error(`Job removal script failed: ${error.message}`);
      throw error;
    }
  }

  async loadInputData() {
    Logger.info('Loading input data...');
    
    const inputPath = path.resolve(this.options.inputFile);
    if (!(await this.fileExists(inputPath))) {
      throw new Error(`${this.options.inputFile} not found in current directory`);
    }

    const data = await fs.readFile(inputPath, 'utf8');
    return JSON.parse(data);
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async createOutputDirectory() {
    Logger.info('Creating output directory...');
    
    const outputPath = path.resolve(this.options.outputDir);
    
    try {
      await fs.mkdir(outputPath, { recursive: true });
      Logger.success('Output directory created successfully');
    } catch (error) {
      Logger.warning(`Failed to create output directory: ${error.message}`);
      throw error;
    }
  }

  async runJobRemovalProcess(originalInputData) {
    Logger.info('Starting iterative job removal process');

    let currentInputData = JSON.parse(JSON.stringify(originalInputData)); // Deep copy
    let pass = 1;
    let jobRemovalCount = this.options.initialJobRemovalCount;
    let lastSuccessfulJobCount = currentInputData.jobs?.length || 0;

    while (pass <= this.options.maxPasses) {
      Logger.info(`\n=== Pass ${pass}/${this.options.maxPasses} ===`);
      Logger.info(`Current jobs count: ${currentInputData.jobs?.length || 0}`);
      Logger.info(`Removing ${jobRemovalCount} jobs this pass`);

      // Submit request to NextBillion.ai
      const result = await this.submitRequest(currentInputData, pass);
      
      if (result.success) {
        Logger.success(`Successful request on pass ${pass}!`);
        this.successfulRequest = result;
        this.successfulJobs = [...currentInputData.jobs];
        break;
      } else if (result.isCapacityError) {
        Logger.warning(`Capacity error on pass ${pass}: ${result.error}`);
        
        // Remove multiple jobs
        const removedJobs = this.removeMultipleJobs(currentInputData, jobRemovalCount);
        if (removedJobs.length > 0) {
          // Add all removed jobs to tracking
          removedJobs.forEach(job => {
            this.removedJobs.push({
              pass,
              job: job,
              error: result.error,
              timestamp: new Date().toISOString()
            });
          });
          Logger.info(`Removed ${removedJobs.length} jobs: ${removedJobs.map(j => j.id).join(', ')}`);
          
          // If we removed a lot of jobs and still have capacity errors, reduce the removal count
          if (jobRemovalCount > 10 && currentInputData.jobs.length < lastSuccessfulJobCount * 0.8) {
            jobRemovalCount = Math.max(10, Math.floor(jobRemovalCount * 0.5));
            Logger.info(`Reducing job removal count to ${jobRemovalCount} for next pass`);
          }
          
          lastSuccessfulJobCount = currentInputData.jobs.length;
        } else {
          Logger.error('No more jobs to remove - stopping process');
          break;
        }
      } else {
        Logger.error(`Non-capacity error on pass ${pass}: ${result.error}`);
        Logger.debug(`Error details: isCapacityError=${result.isCapacityError}, error=${result.error}`);
        // For non-capacity errors, we'll stop the process
        break;
      }

      // Wait before next request (except on the last pass)
      if (pass < this.options.maxPasses) {
        Logger.info(`Waiting ${this.options.delayBetweenRequests / 1000} seconds before next request...`);
        await this.sleep(this.options.delayBetweenRequests);
      }

      pass++;
      this.totalAttempts++;
    }

    if (pass > this.options.maxPasses) {
      Logger.warning(`Reached maximum passes (${this.options.maxPasses})`);
    }
  }

  async submitRequest(inputData, pass) {
    const spinner = ora(`Submitting request (pass ${pass})...`).start();

    try {
      const result = await this.apiClient.runOptimization(inputData);
      
      spinner.succeed(`Request completed (pass ${pass})`);
      return {
        success: true,
        data: result.data,
        pass
      };
    } catch (error) {
      spinner.fail(`Request failed (pass ${pass}): ${error.message}`);
      
      // Log the full error for debugging
      Logger.debug(`Full error object: ${JSON.stringify(error, null, 2)}`);
      
      // Check if this is a capacity error
      const isCapacityError = this.isCapacityError(error);
      
      return {
        success: false,
        error: error.message,
        isCapacityError,
        pass
      };
    }
  }

  isCapacityError(error) {
    // Check if the error message contains capacity-related keywords
    let errorMessage = error.message?.toLowerCase() || '';
    
    // Also check the response data if available (for axios errors)
    if (error.response?.data?.message) {
      errorMessage += ' ' + error.response.data.message.toLowerCase();
    }
    
    // Also check the error data if available
    if (error.data?.message) {
      errorMessage += ' ' + error.data.message.toLowerCase();
    }
    
    // Check the original error if available
    if (error.originalError) {
      if (error.originalError.response?.data?.message) {
        errorMessage += ' ' + error.originalError.response.data.message.toLowerCase();
      }
      if (error.originalError.data?.message) {
        errorMessage += ' ' + error.originalError.data.message.toLowerCase();
      }
    }
    
    const capacityKeywords = [
      'inconsistent delivery dimension',
      'vehicle capacity',
      'capacity',
      'dimension',
      'size'
    ];
    
    Logger.debug(`Checking if error is capacity-related: "${errorMessage}"`);
    const isCapacity = capacityKeywords.some(keyword => errorMessage.includes(keyword));
    Logger.debug(`Capacity error detected: ${isCapacity}`);
    
    return isCapacity;
  }

  removeMultipleJobs(inputData, count) {
    if (!inputData.jobs || inputData.jobs.length === 0) {
      return [];
    }

    const actualCount = Math.min(count, inputData.jobs.length);
    const removedJobs = inputData.jobs.splice(0, actualCount); // Remove from the beginning
    return removedJobs;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generateFinalReport() {
    Logger.info('Generating final report...');

    const report = {
      summary: {
        totalPasses: this.totalAttempts,
        maxPasses: this.options.maxPasses,
        successfulPass: this.successfulRequest ? this.successfulRequest.pass : null,
        originalJobCount: this.successfulJobs.length + this.removedJobs.length,
        finalJobCount: this.successfulJobs.length,
        removedJobCount: this.removedJobs.length,
        success: !!this.successfulRequest
      },
      removedJobs: this.removedJobs,
      successfulJobs: this.successfulJobs.map(job => ({
        id: job.id,
        delivery: job.delivery,
        location: job.location
      })),
      successfulRequest: this.successfulRequest ? {
        pass: this.successfulRequest.pass,
        data: this.successfulRequest.data
      } : null,
      recommendations: this.generateRecommendations()
    };

    // Save final report
    const reportPath = path.join(this.options.outputDir, 'job_removal_report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    await this.printSummary(report);

    return report;
  }

  generateRecommendations() {
    const recommendations = [];

    if (this.successfulRequest) {
      recommendations.push({
        type: 'success',
        description: `Successfully found working configuration after removing ${this.removedJobs.length} jobs`
      });
      
      if (this.removedJobs.length > 0) {
        const lastRemovedJob = this.removedJobs[this.removedJobs.length - 1];
        recommendations.push({
          type: 'info',
          description: `The job that caused the capacity error was: ${lastRemovedJob.job.id} (${lastRemovedJob.job.delivery?.size || 'unknown size'})`
        });
      }
    } else {
      recommendations.push({
        type: 'error',
        description: 'Failed to find a working configuration within the maximum number of passes'
      });
    }

    if (this.removedJobs.length > 0) {
      recommendations.push({
        type: 'warning',
        description: `Consider reviewing the delivery dimensions of the removed jobs to ensure they match vehicle capacity constraints`
      });
    }

    return recommendations;
  }

  async printSummary(report) {
    console.log('\n' + chalk.bold.blue('='.repeat(60)));
    console.log(chalk.bold.blue('JOB REMOVAL SCRIPT SUMMARY'));
    console.log(chalk.bold.blue('='.repeat(60)));
    
    console.log(`\n${chalk.bold('Total Passes:')} ${report.summary.totalPasses}`);
    console.log(`${chalk.bold('Max Passes:')} ${report.summary.maxPasses}`);
    console.log(`${chalk.bold('Original Job Count:')} ${report.summary.originalJobCount}`);
    console.log(`${chalk.bold('Final Job Count:')} ${report.summary.finalJobCount}`);
    console.log(`${chalk.bold('Removed Job Count:')} ${report.summary.removedJobCount}`);
    console.log(`${chalk.bold('Success:')} ${report.summary.success ? chalk.green('✓') : chalk.red('✗')}`);
    
    if (report.summary.successfulPass) {
      console.log(`${chalk.bold('Successful Pass:')} ${report.summary.successfulPass}`);
    }
    
    // Print removed jobs table
    if (report.removedJobs.length > 0) {
      console.log(`\n${chalk.bold.yellow('REMOVED JOBS:')}`);
      console.log(chalk.yellow('-'.repeat(60)));
      
      const columnWidths = {
        pass: 6,
        jobId: 15,
        size: 20,
        error: 40
      };

      // Table header
      const header = [
        this.padRight(chalk.bold.white('Pass'), columnWidths.pass),
        this.padRight(chalk.bold.white('Job ID'), columnWidths.jobId),
        this.padRight(chalk.bold.white('Size'), columnWidths.size),
        this.padRight(chalk.bold.white('Error'), columnWidths.error)
      ];

      console.log(header.join(' | '));
      console.log(chalk.yellow('-'.repeat(60)));

      // Table rows
      report.removedJobs.forEach(removed => {
        const row = [
          this.padRight(chalk.white(removed.pass.toString()), columnWidths.pass),
          this.padRight(chalk.white(removed.job.id), columnWidths.jobId),
          this.padRight(chalk.white(JSON.stringify(removed.job.delivery?.size || 'N/A')), columnWidths.size),
          this.padRight(chalk.red(removed.error.substring(0, 37) + (removed.error.length > 37 ? '...' : '')), columnWidths.error)
        ];

        console.log(row.join(' | '));
      });

      console.log(chalk.yellow('-'.repeat(60)));
    }
    
    if (report.recommendations.length > 0) {
      console.log(`\n${chalk.bold.cyan('RECOMMENDATIONS:')}`);
      report.recommendations.forEach((rec, index) => {
        const color = rec.type === 'success' ? chalk.green : 
                     rec.type === 'warning' ? chalk.yellow : 
                     rec.type === 'error' ? chalk.red : chalk.cyan;
        console.log(`${index + 1}. ${color(rec.description)}`);
      });
    }
    
    console.log(chalk.bold.blue('\n' + '='.repeat(60)));
  }

  padRight(str, width) {
    const plainText = str.replace(/\u001b\[[0-9;]*m/g, ''); // Remove ANSI color codes
    const padding = ' '.repeat(Math.max(0, width - plainText.length));
    return str + padding;
  }
}

// CLI setup
const program = new Command();

program
  .name('job-removal')
  .description('Job Removal Script - Automatically remove jobs when encountering capacity errors')
  .version('1.0.0');

program
  .option('-p, --max-passes <number>', 'Maximum number of passes to attempt', '10')
  .option('-d, --delay <number>', 'Delay between requests in seconds', '10')
  .option('-i, --input-file <path>', 'Input file path', './input_southern.json')
  .option('-o, --output-dir <path>', 'Output directory for results', './job_removal_output')
  .option('-r, --remove-count <number>', 'Initial number of jobs to remove per pass', '200')
  .option('--dry-run', 'Show what would be done without actually running the script');

program.parse();

const options = program.opts();

// Main execution
async function main() {
  try {
    if (options.dryRun) {
      console.log(chalk.yellow('DRY RUN MODE - No actual requests will be made'));
      console.log(`Would use input file: ${options.inputFile}`);
      console.log(`Would make up to ${options.maxPasses} passes`);
      console.log(`Would wait ${options.delay} seconds between requests`);
      console.log(`Would save results to: ${options.outputDir}`);
      return;
    }

    const script = new JobRemovalScript({
      maxPasses: parseInt(options.maxPasses),
      delayBetweenRequests: parseInt(options.delay) * 1000,
      inputFile: options.inputFile,
      outputDir: options.outputDir,
      initialJobRemovalCount: parseInt(options.removeCount)
    });

    await script.run();
    
    Logger.success('Job removal script completed successfully');
    process.exit(0);
  } catch (error) {
    Logger.error(`Process failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default JobRemovalScript; 