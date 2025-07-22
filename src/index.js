#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';

import Logger from './utils/logger.js';
import FileUtils from './utils/fileUtils.js';
import InputParser from './parsers/inputParser.js';
import SolutionParser from './parsers/solutionParser.js';
import LoadAnalyzer from './analyzers/loadAnalyzer.js';
import ConstraintChecker from './analyzers/constraintChecker.js';
import InputModifier from './modifiers/inputModifier.js';
import NextBillionClient from './api/nextBillionClient.js';

// Load environment variables
dotenv.config();

class MVRPExplainability {
  constructor(options = {}) {
    this.options = {
      minLoad: 12000,
      maxIterations: 20,
      useMock: false,
      outputDir: './output',
      ...options
    };

    this.apiClient = new NextBillionClient(
      process.env.NEXTBILLION_API_KEY || 'mock_key',
      process.env.NEXTBILLION_API_URL
    );

    this.iterationHistory = [];
    this.bestSolution = null;
    this.totalAttempts = 0;
  }

  async run() {
    try {
      Logger.info('Starting MVRP Explainability Process');
      Logger.info(`Target minimum load: ${this.options.minLoad}`);
      Logger.info(`Maximum iterations: ${this.options.maxIterations}`);

      // Step 0: Clear output directory
      console.log('About to clear output directory...');
      await this.clearOutputDirectory();
      console.log('Finished clearing output directory...');

      // Step 1: Load and parse input files
      const inputData = await this.loadInputData();
      const solutionData = await this.loadSolutionData();

      // Step 2: Parse and validate data
      const parsedInput = InputParser.parse(inputData);
      const parsedSolution = SolutionParser.parse(solutionData);

      // Step 3: Initial analysis
      const initialAnalysis = LoadAnalyzer.analyzeLoadDistribution(
        parsedSolution.data, 
        this.options.minLoad
      );

      Logger.info(`Initial analysis: ${initialAnalysis.summary.complianceRate.toFixed(1)}% compliance`);

      // Step 4: Check if we already meet constraints
      const constraints = { minLoadPerRoute: this.options.minLoad };
      const constraintCheck = ConstraintChecker.checkSolutionConstraints(
        parsedSolution.data, 
        constraints
      );

      if (constraintCheck.passed) {
        Logger.success('Solution already meets all constraints!');
        return this.generateFinalReport(parsedSolution, initialAnalysis);
      }

      // Step 5: Start iterative optimization
      await this.runIterativeOptimization(parsedInput, parsedSolution);

      // Step 6: Generate final report
      return await this.generateFinalReport(this.bestSolution, initialAnalysis);

    } catch (error) {
      Logger.error(`MVRP Explainability failed: ${error.message}`);
      throw error;
    }
  }

  async loadInputData() {
    Logger.info('Loading input data...');
    
    const inputPath = path.resolve('./input.json');
    if (!(await FileUtils.fileExists(inputPath))) {
      throw new Error('input.json not found in current directory');
    }

    return await FileUtils.readJsonFile(inputPath);
  }

  async loadSolutionData() {
    Logger.info('Loading solution data...');
    
    const solutionPath = path.resolve('./solution.json');
    if (!(await FileUtils.fileExists(solutionPath))) {
      throw new Error('solution.json not found in current directory');
    }

    return await FileUtils.readJsonFile(solutionPath);
  }

  async clearOutputDirectory() {
    Logger.info('Clearing output directory...');
    
    const outputPath = path.resolve('./output');
    
    try {
      // Import fs/promises
      const fs = await import('fs/promises');
      
      // Check if output directory exists and remove it
      try {
        await fs.access(outputPath);
        await fs.rm(outputPath, { recursive: true, force: true });
        Logger.success('Output directory cleared successfully');
      } catch (accessError) {
        // Directory doesn't exist, which is fine
        Logger.info('Output directory does not exist, will create new one');
      }
      
      // Create fresh output directory
      await fs.mkdir(outputPath, { recursive: true });
      Logger.success('Output directory created successfully');
    } catch (error) {
      Logger.warning(`Failed to clear output directory: ${error.message}`);
      // Continue execution even if clearing fails
    }
  }

  async runIterativeOptimization(parsedInput, initialSolution) {
    Logger.info('Starting iterative optimization process');

    let currentInput = parsedInput.data;
    let currentSolution = initialSolution.data;
    let iteration = 1;
    let successfulIteration = 0; // Track the last successful iteration
    let lastSuccessfulInput = currentInput;
    let lastSuccessfulSolution = currentSolution;

    while (iteration <= this.options.maxIterations) {
      Logger.info(`\n=== Iteration ${iteration}/${this.options.maxIterations} ===`);

      // Analyze current solution
      const analysis = LoadAnalyzer.analyzeLoadDistribution(currentSolution, this.options.minLoad);
      
      // Check constraints
      const constraints = { minLoadPerRoute: this.options.minLoad };
      const constraintCheck = ConstraintChecker.checkSolutionConstraints(currentSolution, constraints);



      // Check if we've achieved our goal
      if (constraintCheck.passed && analysis.routeCount > 0) {
        Logger.success(`Constraints met at iteration ${iteration}!`);
        this.bestSolution = currentSolution;
        break;
      }

      // Create modification strategies based on last successful iteration
      const strategies = InputModifier.createLoadBalancingStrategy(analysis, iteration, successfulIteration);
      Logger.info(`Created ${strategies.length} modification strategies`);

      // Apply strategies to input
      const modifiedInput = InputModifier.applyMultipleStrategies(currentInput, strategies);
      
      // Validate modified input
      InputModifier.validateModifiedInput(modifiedInput);

      // Run optimization with modified input
      const optimizationResult = await this.runOptimization(modifiedInput, iteration);
      
      if (!optimizationResult.success) {
        Logger.error(`Optimization failed at iteration ${iteration}`);
        break;
      }

      // Parse new solution
      const newSolution = SolutionParser.parse(optimizationResult.solution);
      const newAnalysis = LoadAnalyzer.analyzeLoadDistribution(newSolution.data, this.options.minLoad);

      // Check if this iteration produced a valid solution (has routes with jobs)
      Logger.debug(`Iteration ${iteration} analysis: totalRoutes=${newAnalysis.summary.totalRoutes}, totalJobsAssigned=${newAnalysis.summary.totalJobsAssigned}`);
      
      if (newAnalysis.summary.totalRoutes > 0) {
        // This is a successful iteration
        currentSolution = newSolution.data;
        currentInput = modifiedInput;
        lastSuccessfulInput = modifiedInput;
        lastSuccessfulSolution = newSolution.data;
        successfulIteration = iteration;
        
        Logger.success(`Successful iteration ${iteration} with ${newAnalysis.summary.totalRoutes} routes`);
        
        // Add successful iteration to history
        const newConstraintCheck = ConstraintChecker.checkSolutionConstraints(newSolution.data, { minLoadPerRoute: this.options.minLoad });
        this.iterationHistory.push({
          iteration,
          analysis: newAnalysis,
          constraintCheck: newConstraintCheck,
          solution: newSolution.data,
          timestamp: new Date().toISOString(),
          relaxed: false
        });
        
        // Update best solution if this one is better
        if (this.isBetterSolution(newSolution, this.bestSolution)) {
          this.bestSolution = currentSolution;
          Logger.success(`New best solution found at iteration ${iteration}`);
        }

        // Save iteration files
        await this.saveIterationFiles(iteration, modifiedInput, newSolution.data, strategies);
      } else {
        // Empty routes - revert to last successful iteration and try less constrained approach
        Logger.warning(`Iteration ${iteration} produced no routes - reverting to last successful iteration ${successfulIteration}`);
        
        if (successfulIteration > 0) {
          currentInput = lastSuccessfulInput;
          currentSolution = lastSuccessfulSolution;
          
          // Create less constrained strategies
          const relaxedStrategies = InputModifier.createRelaxedLoadBalancingStrategy(
            LoadAnalyzer.analyzeLoadDistribution(currentSolution, this.options.minLoad), 
            iteration, 
            successfulIteration
          );
          
          Logger.info(`Created ${relaxedStrategies.length} relaxed modification strategies`);
          
          // Apply relaxed strategies
          const relaxedInput = InputModifier.applyMultipleStrategies(currentInput, relaxedStrategies);
          InputModifier.validateModifiedInput(relaxedInput);
          
          // Run optimization with relaxed input
          const relaxedResult = await this.runOptimization(relaxedInput, iteration);
          
          if (relaxedResult.success) {
            const relaxedSolution = SolutionParser.parse(relaxedResult.solution);
            const relaxedAnalysis = LoadAnalyzer.analyzeLoadDistribution(relaxedSolution.data, this.options.minLoad);
            
            if (relaxedAnalysis.routeCount > 0) {
              currentSolution = relaxedSolution.data;
              currentInput = relaxedInput;
              lastSuccessfulInput = relaxedInput;
              lastSuccessfulSolution = relaxedSolution.data;
              successfulIteration = iteration;
              
              Logger.success(`Relaxed iteration ${iteration} successful with ${relaxedAnalysis.routeCount} routes`);
              
              // Add successful relaxed iteration to history
              const relaxedConstraintCheck = ConstraintChecker.checkSolutionConstraints(relaxedSolution.data, { minLoadPerRoute: this.options.minLoad });
              this.iterationHistory.push({
                iteration,
                analysis: relaxedAnalysis,
                constraintCheck: relaxedConstraintCheck,
                solution: relaxedSolution.data,
                timestamp: new Date().toISOString(),
                relaxed: true
              });
              
              if (this.isBetterSolution(relaxedSolution, this.bestSolution)) {
                this.bestSolution = currentSolution;
                Logger.success(`New best solution found at iteration ${iteration} (relaxed)`);
              }
              
              await this.saveIterationFiles(iteration, relaxedInput, relaxedSolution.data, relaxedStrategies);
            } else {
              Logger.error(`Relaxed iteration ${iteration} also failed - no routes produced`);
            }
          } else {
            Logger.error(`Relaxed optimization failed at iteration ${iteration}`);
          }
        } else {
          Logger.error(`No successful iterations to revert to - stopping optimization`);
          break;
        }
      }

      this.totalAttempts++;
      iteration++;
    }

    if (iteration > this.options.maxIterations) {
      Logger.warning(`Reached maximum iterations (${this.options.maxIterations})`);
    }
  }

  async runOptimization(inputData, iteration) {
    const spinner = ora(`Running optimization (iteration ${iteration})...`).start();

    try {
      let result;
      
      if (this.options.useMock) {
        // Use mock response for testing
        result = this.apiClient.createMockResponse(inputData);
        await this.apiClient.sleep(2000); // Simulate processing time
      } else {
        // Run actual optimization
        result = await this.apiClient.runOptimization(inputData);
      }

      spinner.succeed(`Optimization completed (iteration ${iteration})`);
      return result;
    } catch (error) {
      spinner.fail(`Optimization failed (iteration ${iteration}): ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  isBetterSolution(newSolution, currentBest) {
    if (!currentBest) return true;

    const newAnalysis = LoadAnalyzer.analyzeLoadDistribution(newSolution.data, this.options.minLoad);
    const currentAnalysis = LoadAnalyzer.analyzeLoadDistribution(currentBest, this.options.minLoad);

    // Reject solutions with no routes (failed optimization)
    if (newAnalysis.routeCount === 0) {
      Logger.warning('Rejecting solution with no routes (failed optimization)');
      return false;
    }

    // Prefer solutions with higher compliance rate
    if (newAnalysis.summary.complianceRate > currentAnalysis.summary.complianceRate) {
      return true;
    }

    // If compliance rates are equal, prefer solutions with fewer routes
    if (newAnalysis.summary.complianceRate === currentAnalysis.summary.complianceRate) {
      return newAnalysis.routeCount < currentAnalysis.routeCount;
    }

    return false;
  }

  async saveIterationFiles(iteration, inputData, solutionData, strategies) {
    const outputDir = path.resolve(this.options.outputDir);
    await FileUtils.ensureDirectory(outputDir);

    const iterationDir = path.join(outputDir, `iteration_${iteration}`);
    await FileUtils.ensureDirectory(iterationDir);

    // Save modified input
    await FileUtils.writeJsonFile(
      path.join(iterationDir, 'input.json'),
      inputData
    );

    // Save solution
    await FileUtils.writeJsonFile(
      path.join(iterationDir, 'solution.json'),
      solutionData
    );

    // Save strategies
    await FileUtils.writeJsonFile(
      path.join(iterationDir, 'strategies.json'),
      strategies
    );

    Logger.debug(`Saved iteration ${iteration} files to ${iterationDir}`);
  }

  async generateFinalReport(finalSolution, initialAnalysis) {
    Logger.info('Generating final report...');

    // Handle case where no successful iterations occurred
    if (!finalSolution || !finalSolution.routes) {
      const report = {
        summary: {
          totalIterations: this.iterationHistory.length,
          totalAttempts: this.totalAttempts || 0,
          targetMinLoad: this.options.minLoad,
          initialComplianceRate: initialAnalysis.summary.complianceRate,
          finalComplianceRate: 0,
          improvement: -initialAnalysis.summary.complianceRate,
          constraintsMet: false,
          bestSolutionFound: false
        },
        initialAnalysis: initialAnalysis.summary,
        finalAnalysis: { complianceRate: 0, totalRoutes: 0, routesBelowCount: 0, totalLoadGap: 0 },
        constraintCheck: { passed: false, violations: [] },
        iterationHistory: this.iterationHistory.map(iter => ({
          iteration: iter.iteration,
          complianceRate: iter.analysis.summary.complianceRate,
          totalRoutes: iter.analysis.summary.totalRoutes,
          routesBelowTarget: iter.analysis.summary.routesBelowCount,
          totalLoadGap: iter.analysis.summary.totalLoadGap,
          constraintsPassed: iter.constraintCheck.passed,
          relaxed: iter.relaxed || false
        })),
        recommendations: [{ description: "No successful optimization iterations found. Consider relaxing constraints or adjusting parameters." }]
      };

      // Save final report
      const reportPath = path.join(this.options.outputDir, 'final_report.json');
      await FileUtils.writeJsonFile(reportPath, report);

      // Print summary
      await this.printSummary(report);

      return report;
    }

    const finalAnalysis = LoadAnalyzer.analyzeLoadDistribution(finalSolution, this.options.minLoad);
    const constraints = { minLoadPerRoute: this.options.minLoad };
    const finalConstraintCheck = ConstraintChecker.checkSolutionConstraints(finalSolution, constraints);

    const report = {
      summary: {
        totalIterations: this.iterationHistory.length,
        totalAttempts: this.totalAttempts || 0,
        targetMinLoad: this.options.minLoad,
        initialComplianceRate: initialAnalysis.summary.complianceRate,
        finalComplianceRate: finalAnalysis.summary.complianceRate,
        improvement: finalAnalysis.summary.complianceRate - initialAnalysis.summary.complianceRate,
        constraintsMet: finalConstraintCheck.passed,
        bestSolutionFound: !!this.bestSolution
      },
      initialAnalysis: initialAnalysis.summary,
      finalAnalysis: finalAnalysis.summary,
      constraintCheck: finalConstraintCheck,
      iterationHistory: this.iterationHistory.map(iter => ({
        iteration: iter.iteration,
        complianceRate: iter.analysis.summary.complianceRate,
        totalRoutes: iter.analysis.summary.totalRoutes,
        routesBelowTarget: iter.analysis.summary.routesBelowCount,
        totalLoadGap: iter.analysis.summary.totalLoadGap,
        constraintsPassed: iter.constraintCheck.passed,
        relaxed: iter.relaxed || false
      })),
      recommendations: ConstraintChecker.getConstraintViolationDetails(finalConstraintCheck).recommendations
    };

    // Save final report
    const reportPath = path.join(this.options.outputDir, 'final_report.json');
    await FileUtils.writeJsonFile(reportPath, report);

    // Print summary
    await this.printSummary(report);

    return report;
  }

  async printSummary(report) {
    console.log('\n' + chalk.bold.blue('='.repeat(60)));
    console.log(chalk.bold.blue('MVRP EXPLAINABILITY SUMMARY'));
    console.log(chalk.bold.blue('='.repeat(60)));
    
    console.log(`\n${chalk.bold('Target Minimum Load:')} ${report.summary.targetMinLoad}`);
    console.log(`${chalk.bold('Successful Iterations:')} ${report.summary.totalIterations}`);
    console.log(`${chalk.bold('Total Attempts:')} ${report.summary.totalAttempts}`);
    console.log(`${chalk.bold('Initial Compliance:')} ${report.summary.initialComplianceRate.toFixed(1)}%`);
    console.log(`${chalk.bold('Final Compliance:')} ${report.summary.finalComplianceRate.toFixed(1)}%`);
    console.log(`${chalk.bold('Improvement:')} ${report.summary.improvement.toFixed(1)}%`);
    console.log(`${chalk.bold('Constraints Met:')} ${report.summary.constraintsMet ? chalk.green('✓') : chalk.red('✗')}`);
    
    // Print iteration summary table
    await this.printIterationTable(report.iterationHistory);
    
    if (report.recommendations.length > 0) {
      console.log(`\n${chalk.bold.yellow('Recommendations:')}`);
      report.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec.description}`);
      });
    }
    
    console.log(chalk.bold.blue('\n' + '='.repeat(60)));
  }

  async printIterationTable(iterationHistory) {
    if (!iterationHistory || iterationHistory.length === 0) {
      console.log(`\n${chalk.yellow('No successful iterations to display')}`);
      return;
    }

    console.log(`\n${chalk.bold.cyan('ITERATION SUMMARY TABLE')}`);

    // Define column widths
    const columnWidths = {
      iter: 4,
      compliance: 10,
      routes: 6,
      loadGap: 9,
      objective: 20,
      vehicles: 12,
      time: 12,
      type: 8
    };

    // Calculate total width
    const totalWidth = Object.values(columnWidths).reduce((sum, width) => sum + width, 0) + 
                      (Object.keys(columnWidths).length - 1) * 3; // 3 chars for separators

    console.log(chalk.cyan('='.repeat(totalWidth)));

    // Table header
    const header = [
      this.padRight(chalk.bold.white('Iter'), columnWidths.iter),
      this.padRight(chalk.bold.white('Compliance'), columnWidths.compliance),
      this.padRight(chalk.bold.white('Routes'), columnWidths.routes),
      this.padRight(chalk.bold.white('Load Gap'), columnWidths.loadGap),
      this.padRight(chalk.bold.white('Objective'), columnWidths.objective),
      this.padRight(chalk.bold.white('Vehicles'), columnWidths.vehicles),
      this.padRight(chalk.bold.white('Time Window'), columnWidths.time),
      this.padRight(chalk.bold.white('Type'), columnWidths.type)
    ];

    console.log(header.join(' | '));
    console.log(chalk.cyan('-'.repeat(totalWidth)));

    // Group iterations by iteration number to show both regular and relaxed attempts
    const groupedIterations = {};
    iterationHistory.forEach(iter => {
      if (!groupedIterations[iter.iteration]) {
        groupedIterations[iter.iteration] = [];
      }
      groupedIterations[iter.iteration].push(iter);
    });

    // Sort by iteration number
    const sortedIterations = Object.keys(groupedIterations).sort((a, b) => parseInt(a) - parseInt(b));

    for (const iterationNum of sortedIterations) {
      const iterations = groupedIterations[iterationNum];
      
      for (const iter of iterations) {
        const isRelaxed = iter.relaxed || false;
        const status = isRelaxed ? chalk.yellow('Relaxed') : chalk.green('Regular');
        
        // Get strategy details from the iteration data
        const strategyDetails = await this.getStrategyDetails(iter);
        
        const row = [
          this.padRight(chalk.bold.white(iter.iteration), columnWidths.iter),
          this.padRight(this.formatCompliance(iter.complianceRate), columnWidths.compliance),
          this.padRight(chalk.white(`${iter.totalRoutes || 0}`), columnWidths.routes),
          this.padRight(chalk.white(`${iter.totalLoadGap || 0}`), columnWidths.loadGap),
          this.padRight(chalk.cyan(strategyDetails.objective || 'N/A'), columnWidths.objective),
          this.padRight(chalk.cyan(strategyDetails.vehicles || 'N/A'), columnWidths.vehicles),
          this.padRight(chalk.cyan(strategyDetails.timeRelax || 'N/A'), columnWidths.time),
          this.padRight(status, columnWidths.type)
        ];

        console.log(row.join(' | '));
      }
    }

    console.log(chalk.cyan('='.repeat(totalWidth)));
    
    // Print strategy change summary
    await this.printStrategyChangeSummary(sortedIterations, groupedIterations);
  }

  padRight(str, width) {
    const plainText = str.replace(/\u001b\[[0-9;]*m/g, ''); // Remove ANSI color codes
    const padding = ' '.repeat(Math.max(0, width - plainText.length));
    return str + padding;
  }

  async printStrategyChangeSummary(sortedIterations, groupedIterations) {
    console.log(`\n${chalk.bold.yellow('STRATEGY CHANGE SUMMARY')}`);
    console.log(chalk.yellow('-'.repeat(60)));
    
    let prevObjective = null;
    let prevWeight = null;
    let prevVehicles = null;
    let prevTime = null;
    
    for (const iterationNum of sortedIterations) {
      const iterations = groupedIterations[iterationNum];
      if (iterations.length > 0) {
        const firstIter = iterations[0];
        const strategyDetails = await this.getStrategyDetailsSync({ iteration: firstIter.iteration });
        

        
        const changes = [];
        if (strategyDetails.objective !== prevObjective && strategyDetails.objective !== 'N/A') {
          changes.push(`Objective: ${prevObjective || 'None'} → ${strategyDetails.objective}`);
          prevObjective = strategyDetails.objective;
        }
        if (strategyDetails.loadWeight !== prevWeight && strategyDetails.loadWeight !== 'N/A') {
          changes.push(`Weight: ${prevWeight || 'None'} → ${strategyDetails.loadWeight}`);
          prevWeight = strategyDetails.loadWeight;
        }
        if (strategyDetails.vehicles !== prevVehicles && strategyDetails.vehicles !== 'N/A') {
          changes.push(`Vehicles: ${prevVehicles || 'None'} → ${strategyDetails.vehicles}`);
          prevVehicles = strategyDetails.vehicles;
        }
        if (strategyDetails.timeRelax !== prevTime && strategyDetails.timeRelax !== 'N/A') {
          changes.push(`Time: ${prevTime || 'None'} → ${strategyDetails.timeRelax}`);
          prevTime = strategyDetails.timeRelax;
        }
        
        if (changes.length > 0) {
          console.log(chalk.cyan(`Iteration ${iterationNum}:`));
          changes.forEach(change => {
            console.log(chalk.white(`  • ${change}`));
          });
        }
      }
    }
  }

  async getStrategyDetailsSync(iteration) {
    // Try to get strategy details from saved files
    try {
      const strategyPath = path.join(this.options.outputDir, `iteration_${iteration.iteration}`, 'strategies.json');
      const fs = await import('fs/promises');
      const exists = await fs.access(strategyPath).then(() => true).catch(() => false);
      
      if (exists) {
        const strategies = JSON.parse(await fs.readFile(strategyPath, 'utf8'));
        return this.extractStrategyDetails(strategies);
      }
    } catch (error) {
      // If we can't read the file, return default values
    }

    return {
      objective: 'N/A',
      vehicles: 'N/A',
      timeRelax: 'N/A'
    };
  }

  async getStrategyDetails(iteration) {
    // Try to get strategy details from saved files
    try {
      const strategyPath = path.join(this.options.outputDir, `iteration_${iteration.iteration}`, 'strategies.json');
      const inputPath = path.join(this.options.outputDir, `iteration_${iteration.iteration}`, 'input.json');
      const fs = await import('fs/promises');
      
      const strategyExists = await fs.access(strategyPath).then(() => true).catch(() => false);
      const inputExists = await fs.access(inputPath).then(() => true).catch(() => false);
      
      let details = {
        objective: 'N/A',
        vehicles: 'N/A',
        timeRelax: 'N/A'
      };
      
      if (strategyExists) {
        const strategies = JSON.parse(await fs.readFile(strategyPath, 'utf8'));
        details = this.extractStrategyDetails(strategies);
      }
      
      // Extract actual time window values from input file
      if (inputExists) {
        const inputData = JSON.parse(await fs.readFile(inputPath, 'utf8'));
        if (inputData.options && inputData.options.constraint) {
          const constraints = inputData.options.constraint;
          if (constraints.max_vehicle_overtime || constraints.max_visit_lateness) {
            const overtime = constraints.max_vehicle_overtime ? Math.round(constraints.max_vehicle_overtime / 60) : 0;
            const lateness = constraints.max_visit_lateness ? Math.round(constraints.max_visit_lateness / 60) : 0;
            details.timeRelax = `${overtime}m/${lateness}m`;
          }
        }
      }
      
      return details;
    } catch (error) {
      // If we can't read the file, return default values
    }

    return {
      objective: 'N/A',
      vehicles: 'N/A',
      timeRelax: 'N/A'
    };
  }

  extractStrategyDetails(strategies) {
    const details = {
      objective: 'N/A',
      vehicles: 'N/A',
      timeRelax: 'N/A'
    };

    strategies.forEach(strategy => {
      switch (strategy.type) {
        case 'objective_modification':
          details.objective = strategy.objective || 'N/A';
          break;
        case 'vehicle_addition':
          details.vehicles = `${strategy.count || 0}@${strategy.capacity || 0}`;
          break;
        case 'time_window_softening':
          details.timeRelax = `${strategy.relaxationMinutes || 0}m`;
          break;
      }
    });

    return details;
  }

  formatCompliance(complianceRate) {
    if (complianceRate >= 80) {
      return chalk.green(`${complianceRate.toFixed(1)}%`);
    } else if (complianceRate >= 60) {
      return chalk.yellow(`${complianceRate.toFixed(1)}%`);
    } else {
      return chalk.red(`${complianceRate.toFixed(1)}%`);
    }
  }
}

// CLI setup
const program = new Command();

program
  .name('mvrp-explainability')
  .description('Explainable route optimization for NextBillion.ai solutions')
  .version('1.0.0');

program
  .option('-m, --min-load <number>', 'Minimum load per route', '12000')
  .option('-i, --max-iterations <number>', 'Maximum number of iterations', '10')
  .option('--use-mock', 'Use mock API responses for testing')
  .option('-o, --output-dir <path>', 'Output directory for results', './output');

program.parse();

const options = program.opts();

// Main execution
async function main() {
  try {
    const mvrpExplainability = new MVRPExplainability({
      minLoad: parseInt(options.minLoad),
      maxIterations: parseInt(options.maxIterations),
      useMock: options.useMock,
      outputDir: options.outputDir
    });

    await mvrpExplainability.run();
    
    Logger.success('MVRP Explainability process completed successfully');
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

export default MVRPExplainability; 