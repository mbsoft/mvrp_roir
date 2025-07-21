import Logger from '../utils/logger.js';

class SolutionParser {
  static parse(solutionData) {
    try {
      Logger.debug('Parsing solution data...');
      
      // Handle nested structure where solution data is under 'result' key
      const actualSolutionData = solutionData.result || solutionData;
      
      const parsed = {
        routes: actualSolutionData.routes || [],
        unassigned: actualSolutionData.unassigned || [],
        summary: actualSolutionData.summary || {}
      };

      // Validate solution structure
      this.validateSolution(parsed);

      // Analyze routes and calculate metrics
      const analysis = this.analyzeRoutes(parsed);
      
      Logger.info(`Parsed solution: ${analysis.routeCount} routes, ${analysis.totalJobs} jobs assigned`);
      Logger.debug(`Average route load: ${analysis.averageRouteLoad.toFixed(2)}`);
      Logger.debug(`Load distribution: min=${analysis.minRouteLoad}, max=${analysis.maxRouteLoad}`);

      return {
        data: parsed,
        analysis
      };
    } catch (error) {
      Logger.error(`Failed to parse solution: ${error.message}`);
      throw error;
    }
  }

  static validateSolution(solution) {
    if (!solution.routes || !Array.isArray(solution.routes)) {
      throw new Error('Invalid routes array in solution');
    }

    solution.routes.forEach((route, index) => {
      if (!route.vehicle) {
        throw new Error(`Route at index ${index} missing vehicle`);
      }
      if (!route.steps || !Array.isArray(route.steps)) {
        throw new Error(`Route ${route.vehicle} missing or invalid steps`);
      }
    });
  }

  static analyzeRoutes(solution) {
    const routeCount = solution.routes.length;
    const unassignedCount = solution.unassigned ? solution.unassigned.length : 0;

    const routeAnalyses = solution.routes.map(route => {
      return this.analyzeRoute(route);
    });

    const totalJobs = routeAnalyses.reduce((sum, analysis) => sum + analysis.jobCount, 0);
    const totalLoad = routeAnalyses.reduce((sum, analysis) => sum + analysis.totalLoad, 0);
    const totalDistance = routeAnalyses.reduce((sum, analysis) => sum + analysis.totalDistance, 0);
    const totalDuration = routeAnalyses.reduce((sum, analysis) => sum + analysis.totalDuration, 0);

    const routeLoads = routeAnalyses.map(analysis => analysis.totalLoad);
    const minRouteLoad = Math.min(...routeLoads);
    const maxRouteLoad = Math.max(...routeLoads);
    const averageRouteLoad = totalLoad / routeCount;

    // Calculate load distribution statistics
    const loadDistribution = this.calculateLoadDistribution(routeLoads);

    return {
      routeCount,
      unassignedCount,
      totalJobs,
      totalLoad,
      totalDistance,
      totalDuration,
      averageRouteLoad,
      minRouteLoad,
      maxRouteLoad,
      loadDistribution,
      routes: routeAnalyses
    };
  }

  static analyzeRoute(route) {
    const jobSteps = route.steps.filter(step => step.type === 'job');
    const jobCount = jobSteps.length;
    
    const totalLoad = jobSteps.reduce((sum, step) => {
      return sum + (step.load ? step.load[0] : 0);
    }, 0);

    const totalDistance = route.summary ? route.summary.distance : 0;
    const totalDuration = route.summary ? route.summary.duration : 0;

    return {
      vehicleId: route.vehicle,
      jobCount,
      totalLoad,
      totalDistance,
      totalDuration,
      steps: route.steps,
      summary: route.summary
    };
  }

  static calculateLoadDistribution(routeLoads) {
    const sorted = [...routeLoads].sort((a, b) => a - b);
    const count = sorted.length;
    
    return {
      median: sorted[Math.floor(count / 2)],
      q1: sorted[Math.floor(count * 0.25)],
      q3: sorted[Math.floor(count * 0.75)],
      standardDeviation: this.calculateStandardDeviation(routeLoads),
      coefficientOfVariation: this.calculateCoefficientOfVariation(routeLoads)
    };
  }

  static calculateStandardDeviation(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }

  static calculateCoefficientOfVariation(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const stdDev = this.calculateStandardDeviation(values);
    return mean > 0 ? (stdDev / mean) * 100 : 0;
  }

  static getRoutesBelowThreshold(solution, threshold) {
    const analysis = this.analyzeRoutes(solution);
    return analysis.routes.filter(route => route.totalLoad < threshold);
  }

  static getRoutesAboveThreshold(solution, threshold) {
    const analysis = this.analyzeRoutes(solution);
    return analysis.routes.filter(route => route.totalLoad > threshold);
  }

  static getRouteByVehicleId(solution, vehicleId) {
    return solution.routes.find(route => route.vehicle === vehicleId);
  }

  static getJobsInRoute(route) {
    return route.steps
      .filter(step => step.type === 'job')
      .map(step => ({
        jobId: step.job_id,
        load: step.load ? step.load[0] : 0,
        location: step.location,
        arrival: step.arrival,
        departure: step.departure
      }));
  }

  static calculateLoadBalanceScore(solution) {
    const analysis = this.analyzeRoutes(solution);
    const { loadDistribution } = analysis;
    
    // Lower coefficient of variation indicates better load balance
    const balanceScore = Math.max(0, 100 - loadDistribution.coefficientOfVariation);
    
    return {
      score: balanceScore,
      coefficientOfVariation: loadDistribution.coefficientOfVariation,
      interpretation: this.interpretLoadBalanceScore(balanceScore)
    };
  }

  static interpretLoadBalanceScore(score) {
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Fair';
    if (score >= 60) return 'Poor';
    return 'Very Poor';
  }
}

export default SolutionParser; 