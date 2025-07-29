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

class TestSpecificRange {
  constructor(options = {}) {
    this.options = {
      delayBetweenRequests: 10000, // 10 seconds
      inputFile: './input_southern.json',
      outputDir: './range_test_output',
      startIndex: 0,
      endIndex: 50,
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
      Logger.info('Starting Specific Range Test Script');
      Logger.info(`Input file: ${this.options.inputFile}`);
      Logger.info(`Testing range: ${this.options.startIndex} to ${this.options.endIndex}`);
      Logger.info(`Delay between requests: ${this.options.delayBetweenRequests / 1000} seconds`);

      // Step 1: Load input data
      const inputData = await this.loadInputData();
      Logger.info(`Loaded input with ${inputData.jobs?.length || 0} jobs and ${inputData.vehicles?.length || 0} vehicles`);

      // Step 2: Create output directory
      await this.createOutputDirectory();

      // Step 3: Get the second batch of 200 jobs that were removed
      const secondBatchJobs = await this.getSecondBatchJobs();
      Logger.info(`Testing range ${this.options.startIndex}-${this.options.endIndex} of ${secondBatchJobs.length} jobs`);

      // Step 4: Test the specific range
      await this.testSpecificRange(inputData, secondBatchJobs);

      // Step 5: Generate final report
      await this.generateFinalReport();

      Logger.success('Specific range test completed successfully');
      return this.successfulRequest;

    } catch (error) {
      Logger.error(`Specific range test failed: ${error.message}`);
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
    // Read the job removal report to get the second batch of 200 jobs
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

  async testSpecificRange(originalInputData, secondBatchJobs) {
    Logger.info('Starting specific range test');

    // Get the working configuration (542 jobs)
    const workingJobs = await this.getSuccessfulConfiguration(originalInputData);
    
    // Get the specific range of jobs to test
    const startIndex = Math.max(0, this.options.startIndex);
    const endIndex = Math.min(secondBatchJobs.length, this.options.endIndex);
    const jobsToTest = secondBatchJobs.slice(startIndex, endIndex);
    
    Logger.info(`Testing jobs ${startIndex} to ${endIndex}: ${jobsToTest.map(j => j.id).join(', ')}`);

    // Create test input data with working jobs + the range to test
    const testInputData = {
      ...originalInputData,
      jobs: [...workingJobs, ...jobsToTest]
    };

    Logger.info(`Total jobs in test: ${testInputData.jobs.length}`);

    // Submit request to NextBillion.ai
    const result = await this.submitRequest(testInputData);
    
    if (result.success) {
      Logger.success(`Range ${startIndex}-${endIndex} works successfully!`);
      this.successfulRequest = result;
      this.successfulJobs = [...testInputData.jobs];
    } else if (result.isCapacityError) {
      Logger.warning(`Range ${startIndex}-${endIndex} causes capacity error: ${result.error}`);
      
      // Add the jobs to our removed list
      jobsToTest.forEach(job => {
        this.removedJobs.push({
          job: job,
          error: result.error,
          timestamp: new Date().toISOString(),
          range: `${startIndex}-${endIndex}`
        });
      });
    } else {
      Logger.error(`Range ${startIndex}-${endIndex} causes non-capacity error: ${result.error}`);
    }

    this.totalAttempts++;
  }

  async submitRequest(inputData) {
    const spinner = ora(`Submitting request for range ${this.options.startIndex}-${this.options.endIndex}...`).start();

    try {
      const result = await this.apiClient.runOptimization(inputData);
      
      spinner.succeed(`Request completed for range ${this.options.startIndex}-${this.options.endIndex}`);
      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      spinner.fail(`Request failed for range ${this.options.startIndex}-${this.options.endIndex}: ${error.message}`);
      
      // Check if this is a capacity error
      const isCapacityError = this.isCapacityError(error);
      
      return {
        success: false,
        error: error.message,
        isCapacityError
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
        totalAttempts: this.totalAttempts,
        startIndex: this.options.startIndex,
        endIndex: this.options.endIndex,
        successfulRequest: !!this.successfulRequest,
        removedJobCount: this.removedJobs.length
      },
      removedJobs: this.removedJobs,
      successfulJobs: this.successfulJobs.map(job => ({
        id: job.id,
        delivery: job.delivery,
        location: job.location
      })),
      successfulRequest: this.successfulRequest ? {
        data: this.successfulRequest.data
      } : null,
      recommendations: this.generateRecommendations()
    };

    // Save final report
    const reportPath = path.join(this.options.outputDir, `range_test_${this.options.startIndex}_${this.options.endIndex}.json`);
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
        description: `Range ${this.options.startIndex}-${this.options.endIndex} works successfully`
      });
    } else {
      recommendations.push({
        type: 'error',
        description: `Range ${this.options.startIndex}-${this.options.endIndex} causes errors`
      });
      
      if (this.removedJobs.length > 0) {
        recommendations.push({
          type: 'info',
          description: `Identified ${this.removedJobs.length} jobs in this range that cause capacity errors`
        });
      }
    }

    return recommendations;
  }

  async printSummary(report) {
    console.log('\n' + chalk.bold.blue('='.repeat(60)));
    console.log(chalk.bold.blue('SPECIFIC RANGE TEST SUMMARY'));
    console.log(chalk.bold.blue('='.repeat(60)));
    
    console.log(`\n${chalk.bold('Range Tested:')} ${report.summary.startIndex}-${report.summary.endIndex}`);
    console.log(`${chalk.bold('Success:')} ${report.summary.successfulRequest ? chalk.green('✓') : chalk.red('✗')}`);
    console.log(`${chalk.bold('Removed Job Count:')} ${report.summary.removedJobCount}`);
    
    // Print removed jobs table
    if (report.removedJobs.length > 0) {
      console.log(`\n${chalk.bold.yellow('PROBLEMATIC JOBS IN RANGE:')}`);
      console.log(chalk.yellow('-'.repeat(60)));
      
      const columnWidths = {
        jobId: 20,
        size: 20,
        range: 15,
        error: 40
      };

      // Table header
      const header = [
        this.padRight(chalk.bold.white('Job ID'), columnWidths.jobId),
        this.padRight(chalk.bold.white('Size'), columnWidths.size),
        this.padRight(chalk.bold.white('Range'), columnWidths.range),
        this.padRight(chalk.bold.white('Error'), columnWidths.error)
      ];

      console.log(header.join(' | '));
      console.log(chalk.yellow('-'.repeat(60)));

      // Table rows
      report.removedJobs.forEach(removed => {
        const row = [
          this.padRight(chalk.white(removed.job.id), columnWidths.jobId),
          this.padRight(chalk.white(JSON.stringify(removed.job.delivery?.size || 'N/A')), columnWidths.size),
          this.padRight(chalk.white(removed.range || 'N/A'), columnWidths.range),
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
  .name('test-range')
  .description('Test Specific Range Script - Test a specific range of jobs for capacity errors')
  .version('1.0.0');

program
  .option('-s, --start-index <number>', 'Start index of range to test', '0')
  .option('-e, --end-index <number>', 'End index of range to test', '50')
  .option('-d, --delay <number>', 'Delay between requests in seconds', '10')
  .option('-i, --input-file <path>', 'Input file path', './input_southern.json')
  .option('-o, --output-dir <path>', 'Output directory for results', './range_test_output')
  .option('--dry-run', 'Show what would be done without actually running the script');

program.parse();

const options = program.opts();

// Main execution
async function main() {
  try {
    if (options.dryRun) {
      console.log(chalk.yellow('DRY RUN MODE - No actual requests will be made'));
      console.log(`Would test range: ${options.startIndex}-${options.endIndex}`);
      console.log(`Would use input file: ${options.inputFile}`);
      console.log(`Would wait ${options.delay} seconds between requests`);
      console.log(`Would save results to: ${options.outputDir}`);
      return;
    }

    const script = new TestSpecificRange({
      delayBetweenRequests: parseInt(options.delay) * 1000,
      inputFile: options.inputFile,
      outputDir: options.outputDir,
      startIndex: parseInt(options.startIndex),
      endIndex: parseInt(options.endIndex)
    });

    await script.run();
    
    Logger.success('Specific range test completed successfully');
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

export default TestSpecificRange; 