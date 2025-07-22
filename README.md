# MVRP Explainability - NextBillion.ai Route Optimization Explainability Tool

A Node.js application for explainable NextBillion.ai route optimization solutions by analyzing and modifying input parameters to achieve new constraints and objectives with detailed reasoning.

## Overview

This tool takes existing NextBillion.ai `input.json` and `solution.json` files and provides explainable insights into route optimization by analyzing and modifying input parameters to achieve new goals. The current target is to ensure each route has a minimum load of 12,000 units with detailed reasoning for each modification.

## Problem Analysis

### Current State
- **70 vehicles** with 14,000 capacity each
- **171 jobs** with delivery quantities ranging from 955 to 4,467 units
- **7 time windows** across different days
- **Objective**: Minimize number of vehicles used
- **Current constraint**: Need minimum 12,000 load per route

### Key Observations
- Vehicle capacity (14,000) is sufficient for 12,000 minimum load requirement
- Jobs have multiple time window options for flexibility
- Current objective prioritizes vehicle minimization over load balancing
- Need to modify optimization approach to prioritize load distribution

## Approach

### 1. Core Strategy
- **Explainable Optimization**: Provide detailed reasoning for each optimization decision
- **Constraint-Driven**: Modify input to prioritize load balancing over vehicle minimization
- **Solution Tracking**: Compare and evaluate solutions across iterations with explanations
- **Convergence Monitoring**: Track progress toward target constraints with detailed analysis

### 2. Key Components

#### A. Input/Solution Parser
- Parse and validate NextBillion.ai JSON formats with detailed validation
- Extract current route assignments, loads, and constraints with explanations
- Calculate current performance metrics with comprehensive analysis

#### B. Constraint Analyzer
- Analyze current route loads vs. target minimum (12,000) with detailed reasoning
- Identify routes that need load redistribution with explanations
- Determine which routes can accept additional stops with capacity analysis

#### C. Input Modifier
- Adjust vehicle capacities, time windows, or service times with reasoning
- Modify depot assignments or route constraints with explanations
- Add/remove vehicles or adjust fleet composition with detailed analysis
- Implement load balancing strategies with comprehensive documentation

#### D. Optimization Runner
- Interface with NextBillion.ai API with detailed logging
- Submit modified input files with change documentation
- Retrieve and parse new solutions with comprehensive analysis
- Handle API rate limits and errors with detailed reporting

#### E. Solution Evaluator
- Compare solutions across iterations with detailed analysis
- Track convergence toward target constraints with explanations
- Evaluate trade-offs between load balancing and other objectives with comprehensive reasoning

### 3. Module Structure

```
src/
├── parsers/
│   ├── inputParser.js      # Parse NextBillion input.json
│   └── solutionParser.js   # Parse NextBillion solution.json
├── analyzers/
│   ├── loadAnalyzer.js     # Analyze route loads and constraints
│   └── constraintChecker.js # Check if solutions meet new goals
├── modifiers/
│   ├── inputModifier.js    # Modify input parameters
│   └── loadBalancer.js     # Implement load balancing strategies
├── api/
│   ├── nextBillionClient.js # NextBillion.ai API integration
│   └── rateLimiter.js      # Handle API rate limits
├── evaluators/
│   ├── solutionEvaluator.js # Compare and rank solutions
│   └── metricsCalculator.js # Calculate performance metrics
├── utils/
│   ├── fileUtils.js        # File I/O operations
│   └── logger.js           # Logging and debugging
└── index.js                # Main orchestration logic
```

### 4. Load Balancing Strategies

#### Strategy 1: Objective Modification
- Change objective from "minimize vehicles" to "minimize distance" or "maximize load balance"
- Add custom constraints for minimum route loads

#### Strategy 2: Capacity Adjustment
- Increase vehicle capacities for routes that need more load
- Add vehicles with specific capacity targets

#### Strategy 3: Route Merging
- Combine low-load routes where feasible
- Redistribute stops between routes

#### Strategy 4: Time Window Optimization
- Adjust time windows to allow more stops per route
- Relax time constraints for better load distribution

#### Strategy 5: Fleet Composition
- Add specialized vehicles for load balancing
- Modify vehicle types or capacities

### 5. Explainability Process

#### Phase 1: Analysis
1. Parse current solution and identify routes below 12,000 load with detailed reasoning
2. Calculate load distribution statistics with comprehensive analysis
3. Identify potential redistribution opportunities with explanations

#### Phase 2: Modification
1. Implement load balancing algorithms with detailed reasoning
2. Adjust vehicle capacities or add vehicles with comprehensive analysis
3. Modify time windows or service constraints with explanations
4. Re-run optimization with modified parameters and detailed logging

#### Phase 3: Evaluation
1. Compare new solution against targets with detailed analysis
2. Track improvement metrics with comprehensive reporting
3. Decide whether to continue iterating with detailed reasoning

#### Phase 4: Convergence
1. Implement stopping criteria with detailed reasoning
2. Save best solutions with comprehensive documentation
3. Generate comparison reports with detailed analysis

### 6. Dependencies

#### Core Dependencies
- `axios` - HTTP client for API calls
- `fs-extra` - Enhanced file system operations
- `lodash` - Utility functions for data manipulation

#### Optional Dependencies
- `commander` - CLI argument parsing
- `chalk` - Colored console output
- `ora` - Terminal spinners for long operations
- `dotenv` - Environment variable management

### 7. Risk Mitigation

- **API Rate Limits**: Implement exponential backoff and request queuing
- **Solution Quality**: Maintain original optimization objectives while meeting new constraints
- **Convergence**: Set maximum iteration limits to prevent infinite loops
- **Data Integrity**: Validate all input/output files at each step

### 8. Expected Outcomes

- Routes with minimum 12,000 load each
- Maintained or improved overall optimization metrics
- Systematic approach for future constraint modifications with detailed reasoning
- Reusable framework for different optimization goals with comprehensive analysis

## Usage

```bash
# Install dependencies
npm install

# Run the explainability process
npm start

# Run with custom parameters
npm start -- --min-load 12000 --max-iterations 10
```

## Configuration

Create a `.env` file with your NextBillion.ai API credentials:

```
NEXTBILLION_API_KEY=your_api_key_here
NEXTBILLION_API_URL=https://api.nextbillion.io
```

## Output

The tool will generate:
- Modified input files for each iteration with detailed change documentation
- Solution files for each optimization run with comprehensive analysis
- Comparison reports showing progress with detailed reasoning
- Final optimized solution meeting the new constraints with explainable insights

### Example Output

The tool provides a comprehensive iteration summary table showing the evolution of optimization strategies and their impact:

```
===============================================================================================================
Iter | Compliance | Routes | Load Gap  | Objective            | Weight | Vehicles     | Time Window  | Type    
---------------------------------------------------------------------------------------------------------------
1    | 0.0%       | 42     | 504000    | maximize_load_balance | N/A    | 4@12000      | 45m/30m      | Regular 
2    | 100.0%     | 6      | 0         | minimize_duration    | N/A    | 15@16000     | 60m/30m      | Regular 
3    | 57.1%      | 7      | 21094     | N/A                  | N/A    | N/A          | 15m/15m      | Regular 
4    | 100.0%     | 5      | 0         | N/A                  | N/A    | 3@18000      | 90m/30m      | Regular 
5    | 100.0%     | 5      | 0         | N/A                  | N/A    | N/A          | 120m/30m     | Regular 
6    | 57.1%      | 7      | 12895     | N/A                  | N/A    | N/A          | 30m/30m      | Regular 
7    | 83.3%      | 6      | 4480      | N/A                  | N/A    | 3@16000      | 45m/30m      | Regular 
8    | 83.3%      | 6      | 9014      | N/A                  | N/A    | N/A          | 60m/30m      | Regular 
9    | 57.1%      | 7      | 21127     | N/A                  | N/A    | N/A          | 15m/15m      | Regular 
10   | 100.0%     | 5      | 0         | N/A                  | N/A    | 3@14000      | 90m/30m      | Regular 
===============================================================================================================
```

**Table Columns Explained:**
- **Iter**: Iteration number
- **Compliance**: Percentage of routes meeting the minimum load requirement
- **Routes**: Number of routes in the solution
- **Load Gap**: Total load gap across all routes below target
- **Objective**: Optimization objective (e.g., minimize_duration, maximize_load_balance)
- **Weight**: Load balancing weight (if applicable)
- **Vehicles**: Number and capacity of vehicles added (e.g., "4@12000" = 4 vehicles with 12,000 capacity)
- **Time Window**: Time window softening constraints (overtime/lateness in minutes)
- **Type**: Strategy type (Regular or Relaxed)

**Key Insights from Example:**
- **Iteration 1**: Started with load balancing objective but resulted in too many routes (42)
- **Iteration 2**: Switched to duration minimization with 15 additional vehicles, achieved 100% compliance
- **Iteration 4**: Reduced to 5 routes while maintaining 100% compliance
- **Final Result**: 100% compliance with 5 routes, meeting all constraints

The tool also provides a detailed strategy change summary showing how parameters evolved across iterations to achieve the target constraints. 