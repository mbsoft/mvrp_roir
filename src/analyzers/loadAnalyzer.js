import Logger from '../utils/logger.js';

class LoadAnalyzer {
  static analyzeLoadDistribution(solution, targetMinLoad = 12000) {
    try {
      Logger.debug(`Analyzing load distribution with target minimum: ${targetMinLoad}`);
      
      const analysis = {
        targetMinLoad,
        routesBelowTarget: [],
        routesAboveTarget: [],
        loadGaps: [],
        optimizationOpportunities: [],
        summary: {}
      };

      // Get routes below and above target
      analysis.routesBelowTarget = solution.routes.filter(route => {
        const totalLoad = this.calculateRouteLoad(route);
        return totalLoad < targetMinLoad;
      });

      analysis.routesAboveTarget = solution.routes.filter(route => {
        const totalLoad = this.calculateRouteLoad(route);
        return totalLoad >= targetMinLoad;
      });

      // Calculate load gaps for routes below target
      analysis.loadGaps = analysis.routesBelowTarget.map(route => {
        const currentLoad = this.calculateRouteLoad(route);
        const gap = targetMinLoad - currentLoad;
        return {
          vehicleId: route.vehicle,
          currentLoad,
          targetLoad: targetMinLoad,
          gap,
          gapPercentage: (gap / targetMinLoad) * 100
        };
      });

      // Identify optimization opportunities
      analysis.optimizationOpportunities = this.identifyOptimizationOpportunities(
        analysis.routesBelowTarget,
        analysis.routesAboveTarget,
        targetMinLoad
      );

      // Calculate summary statistics
      analysis.summary = this.calculateLoadSummary(analysis, targetMinLoad);

      Logger.info(`Load analysis complete: ${analysis.routesBelowTarget.length} routes below target`);
      Logger.debug(`Total load gap: ${analysis.summary.totalLoadGap}`);
      Logger.debug(`Average gap per route: ${analysis.summary.averageGap}`);

      return analysis;
    } catch (error) {
      Logger.error(`Failed to analyze load distribution: ${error.message}`);
      throw error;
    }
  }

  static calculateRouteLoad(route) {
    const jobSteps = route.steps.filter(step => step.type === 'job');
    return jobSteps.reduce((sum, step) => {
      return sum + (step.load ? step.load[0] : 0);
    }, 0);
  }

  static identifyOptimizationOpportunities(routesBelowTarget, routesAboveTarget, targetMinLoad) {
    const opportunities = [];

    // Opportunity 1: Routes that can accept more load
    const routesWithCapacity = routesBelowTarget.map(route => {
      const currentLoad = this.calculateRouteLoad(route);
      const vehicleCapacity = this.getVehicleCapacity(route);
      const availableCapacity = vehicleCapacity - currentLoad;
      
      return {
        type: 'capacity_available',
        vehicleId: route.vehicle,
        currentLoad,
        vehicleCapacity,
        availableCapacity,
        priority: availableCapacity > (targetMinLoad - currentLoad) ? 'high' : 'medium'
      };
    });

    // Opportunity 2: Routes that are significantly over target
    const overTargetRoutes = routesAboveTarget.map(route => {
      const currentLoad = this.calculateRouteLoad(route);
      const excessLoad = currentLoad - targetMinLoad;
      
      return {
        type: 'excess_load',
        vehicleId: route.vehicle,
        currentLoad,
        targetLoad: targetMinLoad,
        excessLoad,
        priority: excessLoad > 2000 ? 'high' : 'medium'
      };
    });

    // Opportunity 3: Route merging possibilities
    const mergeOpportunities = this.findMergeOpportunities(routesBelowTarget, targetMinLoad);

    opportunities.push(...routesWithCapacity);
    opportunities.push(...overTargetRoutes);
    opportunities.push(...mergeOpportunities);

    return opportunities.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  static getVehicleCapacity(route) {
    // This would typically come from the input data
    // For now, we'll use a default capacity
    return 14000;
  }

  static findMergeOpportunities(routesBelowTarget, targetMinLoad) {
    const opportunities = [];
    
    // Find pairs of routes that could be merged
    for (let i = 0; i < routesBelowTarget.length; i++) {
      for (let j = i + 1; j < routesBelowTarget.length; j++) {
        const route1 = routesBelowTarget[i];
        const route2 = routesBelowTarget[j];
        
        const load1 = this.calculateRouteLoad(route1);
        const load2 = this.calculateRouteLoad(route2);
        const combinedLoad = load1 + load2;
        
        // Check if combined load would be reasonable (not too high)
        if (combinedLoad <= targetMinLoad * 1.2 && combinedLoad >= targetMinLoad * 0.8) {
          opportunities.push({
            type: 'route_merge',
            vehicleId1: route1.vehicle,
            vehicleId2: route2.vehicle,
            load1,
            load2,
            combinedLoad,
            priority: combinedLoad >= targetMinLoad ? 'high' : 'medium'
          });
        }
      }
    }

    return opportunities;
  }

  static calculateLoadSummary(analysis, targetMinLoad) {
    const totalLoadGap = analysis.loadGaps.reduce((sum, gap) => sum + gap.gap, 0);
    const averageGap = analysis.loadGaps.length > 0 ? totalLoadGap / analysis.loadGaps.length : 0;
    
    const routesBelowCount = analysis.routesBelowTarget.length;
    const routesAboveCount = analysis.routesAboveTarget.length;
    const totalRoutes = routesBelowCount + routesAboveCount;
    
    const complianceRate = totalRoutes > 0 ? (routesAboveCount / totalRoutes) * 100 : 0;

    // Calculate total jobs assigned across all routes
    const totalJobsAssigned = analysis.routesBelowTarget.concat(analysis.routesAboveTarget)
      .reduce((sum, route) => {
        const jobSteps = route.steps.filter(step => step.type === 'job');
        return sum + jobSteps.length;
      }, 0);

    return {
      totalLoadGap,
      averageGap,
      routesBelowCount,
      routesAboveCount,
      totalRoutes,
      totalJobsAssigned,
      complianceRate,
      targetMinLoad
    };
  }

  static suggestLoadBalancingStrategies(analysis) {
    const strategies = [];

    // Strategy 1: Redistribute excess load from over-target routes
    const excessLoadRoutes = analysis.optimizationOpportunities.filter(opp => opp.type === 'excess_load');
    if (excessLoadRoutes.length > 0) {
      strategies.push({
        type: 'redistribute_excess',
        description: 'Move jobs from routes with excess load to routes below target',
        priority: 'high',
        estimatedImpact: 'high',
        routes: excessLoadRoutes
      });
    }

    // Strategy 2: Merge low-load routes
    const mergeOpportunities = analysis.optimizationOpportunities.filter(opp => opp.type === 'route_merge');
    if (mergeOpportunities.length > 0) {
      strategies.push({
        type: 'merge_routes',
        description: 'Combine pairs of routes to achieve target load levels',
        priority: 'medium',
        estimatedImpact: 'medium',
        opportunities: mergeOpportunities
      });
    }

    // Strategy 3: Add capacity to underutilized routes
    const capacityOpportunities = analysis.optimizationOpportunities.filter(opp => opp.type === 'capacity_available');
    if (capacityOpportunities.length > 0) {
      strategies.push({
        type: 'add_capacity',
        description: 'Add more jobs to routes with available capacity',
        priority: 'medium',
        estimatedImpact: 'medium',
        opportunities: capacityOpportunities
      });
    }

    return strategies.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  static calculateLoadBalanceMetrics(solution) {
    const routeLoads = solution.routes.map(route => this.calculateRouteLoad(route));
    
    const mean = routeLoads.reduce((sum, load) => sum + load, 0) / routeLoads.length;
    const variance = routeLoads.reduce((sum, load) => sum + Math.pow(load - mean, 2), 0) / routeLoads.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? (standardDeviation / mean) * 100 : 0;

    return {
      mean,
      standardDeviation,
      coefficientOfVariation,
      min: Math.min(...routeLoads),
      max: Math.max(...routeLoads),
      range: Math.max(...routeLoads) - Math.min(...routeLoads),
      balanceScore: Math.max(0, 100 - coefficientOfVariation)
    };
  }
}

export default LoadAnalyzer; 