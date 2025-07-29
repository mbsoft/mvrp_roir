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

class FineTuneJobRemoval {
  constructor(options = {}) {
    this.options = {
      maxPasses: 10,
      delayBetweenRequests: 10000, // 10 seconds
      inputFile: './input_southern.json',
      outputDir: './fine_tune_output',
      batchSize: 50, // Test 50 jobs at a time
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
      Logger.info('Starting Fine-Tune Job Removal Script');
      Logger.info(`Input file: ${this.options.inputFile}`);
      Logger.info(`Max passes: ${this.options.maxPasses}`);
      Logger.info(`Batch size: ${this.options.batchSize}`);
      Logger.info(`Delay between requests: ${this.options.delayBetweenRequests / 1000} seconds`);

      // Step 1: Load input data
      const inputData = await this.loadInputData();
      Logger.info(`Loaded input with ${inputData.jobs?.length || 0} jobs and ${inputData.vehicles?.length || 0} vehicles`);

      // Step 2: Create output directory
      await this.createOutputDirectory();

      // Step 3: Get the successful configuration (542 jobs)
      const successfulJobs = await this.getSuccessfulConfiguration(inputData);
      Logger.info(`Using successful configuration with ${successfulJobs.length} jobs`);

      // Step 4: Get the second batch of 100 jobs that were removed
      const secondBatchJobs = await this.getSecondBatchJobs();
      Logger.info(`Testing second batch of ${secondBatchJobs.length} jobs`);

      // Step 5: Create a new input data with successful jobs + vehicles
      const testInputData = {
        ...inputData,
        jobs: successfulJobs
      };

      // Step 6: Start fine-tuning process
      await this.runFineTuningProcess(testInputData, secondBatchJobs);

      // Step 5: Generate final report
      await this.generateFinalReport();

      Logger.success('Fine-tune job removal script completed successfully');
      return this.successfulRequest;

    } catch (error) {
      Logger.error(`Fine-tune job removal script failed: ${error.message}`);
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

  async getSecondBatchJobs() {
    // Read the job removal report to get the second batch of 100 jobs
    const reportPath = path.join('./job_removal_output', 'job_removal_report.json');
    
    if (!(await this.fileExists(reportPath))) {
      throw new Error('Job removal report not found. Please run the main job removal script first.');
    }

    const reportData = await fs.readFile(reportPath, 'utf8');
    const report = JSON.parse(reportData);

    // Get jobs from pass 1 (the second batch that was removed)
    const pass1Jobs = report.removedJobs.filter(job => job.pass === 1);
    
    if (pass1Jobs.length === 0) {
      throw new Error('No jobs found from pass 1 in the report');
    }

    Logger.info(`Found ${pass1Jobs.length} jobs from pass 1`);
    return pass1Jobs.map(job => job.job);
  }

  async getSuccessfulConfiguration(originalInputData) {
    // Create a working configuration by removing the first 200 jobs from the original input
    // This gives us the 542 jobs that we know work
    const workingJobs = originalInputData.jobs.slice(200);
    
    Logger.info(`Created working configuration with ${workingJobs.length} jobs (removed first 200)`);
    return workingJobs;
  }

  async runFineTuningProcess(originalInputData, secondBatchJobs) {
    Logger.info('Starting fine-tuning process');

    let currentInputData = JSON.parse(JSON.stringify(originalInputData)); // Deep copy
    let pass = 1;
    let currentBatchSize = this.options.batchSize;
    let remainingJobs = [...secondBatchJobs];

    while (pass <= this.options.maxPasses && remainingJobs.length > 0) {
      Logger.info(`\n=== Fine-Tune Pass ${pass}/${this.options.maxPasses} ===`);
      Logger.info(`Current jobs count: ${currentInputData.jobs?.length || 0}`);
      Logger.info(`Remaining jobs to test: ${remainingJobs.length}`);
      Logger.info(`Testing batch size: ${currentBatchSize}`);

      // Add a batch of jobs back to test
      const jobsToTest = remainingJobs.splice(0, currentBatchSize);
      currentInputData.jobs.push(...jobsToTest);
      
      Logger.info(`Added ${jobsToTest.length} jobs back for testing: ${jobsToTest.map(j => j.id).join(', ')}`);

      // Submit request to NextBillion.ai
      const result = await this.submitRequest(currentInputData, pass);
      
      if (result.success) {
        Logger.success(`Successful request on pass ${pass}!`);
        this.successfulRequest = result;
        this.successfulJobs = [...currentInputData.jobs];
        break;
      } else if (result.isCapacityError) {
        Logger.warning(`Capacity error on pass ${pass}: ${result.error}`);
        
        // Remove the jobs we just added back
        currentInputData.jobs.splice(-jobsToTest.length);
        
        // Add the jobs to our removed list
        jobsToTest.forEach(job => {
          this.removedJobs.push({
            pass,
            job: job,
            error: result.error,
            timestamp: new Date().toISOString(),
            batchSize: currentBatchSize
          });
        });
        
        Logger.info(`Confirmed ${jobsToTest.length} jobs cause capacity error`);
        
        // If we're testing with a batch size > 1, reduce it for more precision
        if (currentBatchSize > 1) {
          currentBatchSize = Math.max(1, Math.floor(currentBatchSize / 2));
          Logger.info(`Reducing batch size to ${currentBatchSize} for more precision`);
        }
      } else {
        Logger.error(`Non-capacity error on pass ${pass}: ${result.error}`);
        Logger.debug(`Error details: isCapacityError=${result.isCapacityError}, error=${result.error}`);
        // For non-capacity errors, we'll stop the process
        break;
      }

      // Wait before next request (except on the last pass)
      if (pass < this.options.maxPasses && remainingJobs.length > 0) {
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
    const reportPath = path.join(this.options.outputDir, 'fine_tune_report.json');
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
        description: `Successfully identified problematic jobs from the second batch`
      });
      
      if (this.removedJobs.length > 0) {
        recommendations.push({
          type: 'info',
          description: `Identified ${this.removedJobs.length} jobs that cause capacity errors`
        });
      }
    } else {
      recommendations.push({
        type: 'error',
        description: 'Failed to identify problematic jobs within the maximum number of passes'
      });
    }

    if (this.removedJobs.length > 0) {
      recommendations.push({
        type: 'warning',
        description: `Consider reviewing the delivery dimensions of the identified problematic jobs to ensure they match vehicle capacity constraints`
      });
    }

    return recommendations;
  }

  async printSummary(report) {
    console.log('\n' + chalk.bold.blue('='.repeat(60)));
    console.log(chalk.bold.blue('FINE-TUNE JOB REMOVAL SUMMARY'));
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
      console.log(`\n${chalk.bold.yellow('IDENTIFIED PROBLEMATIC JOBS:')}`);
      console.log(chalk.yellow('-'.repeat(60)));
      
      const columnWidths = {
        pass: 6,
        jobId: 20,
        size: 20,
        batchSize: 10,
        error: 30
      };

      // Table header
      const header = [
        this.padRight(chalk.bold.white('Pass'), columnWidths.pass),
        this.padRight(chalk.bold.white('Job ID'), columnWidths.jobId),
        this.padRight(chalk.bold.white('Size'), columnWidths.size),
        this.padRight(chalk.bold.white('Batch'), columnWidths.batchSize),
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
          this.padRight(chalk.white(removed.batchSize?.toString() || 'N/A'), columnWidths.batchSize),
          this.padRight(chalk.red(removed.error.substring(0, 27) + (removed.error.length > 27 ? '...' : '')), columnWidths.error)
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
  .name('fine-tune-job-removal')
  .description('Fine-Tune Job Removal Script - Identify specific problematic jobs from a batch')
  .version('1.0.0');

program
  .option('-p, --max-passes <number>', 'Maximum number of passes to attempt', '10')
  .option('-d, --delay <number>', 'Delay between requests in seconds', '10')
  .option('-i, --input-file <path>', 'Input file path', './input_southern.json')
  .option('-o, --output-dir <path>', 'Output directory for results', './fine_tune_output')
  .option('-b, --batch-size <number>', 'Initial batch size for testing', '50')
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
      console.log(`Would test with batch size: ${options.batchSize}`);
      console.log(`Would wait ${options.delay} seconds between requests`);
      console.log(`Would save results to: ${options.outputDir}`);
      return;
    }

    const script = new FineTuneJobRemoval({
      maxPasses: parseInt(options.maxPasses),
      delayBetweenRequests: parseInt(options.delay) * 1000,
      inputFile: options.inputFile,
      outputDir: options.outputDir,
      batchSize: parseInt(options.batchSize)
    });

    await script.run();
    
    Logger.success('Fine-tune job removal script completed successfully');
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

export default FineTuneJobRemoval; 