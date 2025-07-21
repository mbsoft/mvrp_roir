import Logger from '../utils/logger.js';

class ConstraintChecker {
  static checkSolutionConstraints(solution, constraints) {
    try {
      Logger.debug('Checking solution against constraints...');
      
      const results = {
        passed: true,
        violations: [],
        warnings: [],
        summary: {}
      };

      // Check for empty solution (failed optimization)
      if (!solution.routes || solution.routes.length === 0) {
        results.violations.push({
          type: 'no_routes_violation',
          description: 'Optimization failed to produce any viable routes',
          severity: 'critical'
        });
        results.passed = false;
        Logger.warning('Solution has no routes - optimization failed');
        return results;
      }

      // Check each constraint type
      if (constraints.minLoadPerRoute) {
        const loadCheck = this.checkMinLoadConstraint(solution, constraints.minLoadPerRoute);
        results.violations.push(...loadCheck.violations);
        results.warnings.push(...loadCheck.warnings);
      }

      if (constraints.maxLoadPerRoute) {
        const maxLoadCheck = this.checkMaxLoadConstraint(solution, constraints.maxLoadPerRoute);
        results.violations.push(...maxLoadCheck.violations);
        results.warnings.push(...maxLoadCheck.warnings);
      }

      if (constraints.maxRoutes) {
        const routeCheck = this.checkMaxRoutesConstraint(solution, constraints.maxRoutes);
        results.violations.push(...routeCheck.violations);
        results.warnings.push(...routeCheck.warnings);
      }

      if (constraints.maxDistance) {
        const distanceCheck = this.checkMaxDistanceConstraint(solution, constraints.maxDistance);
        results.violations.push(...distanceCheck.violations);
        results.warnings.push(...distanceCheck.warnings);
      }

      if (constraints.maxDuration) {
        const durationCheck = this.checkMaxDurationConstraint(solution, constraints.maxDuration);
        results.violations.push(...durationCheck.violations);
        results.warnings.push(...durationCheck.warnings);
      }

      // Determine overall pass/fail status
      results.passed = results.violations.length === 0;
      
      // Generate summary
      results.summary = this.generateConstraintSummary(results, constraints);

      Logger.info(`Constraint check complete: ${results.passed ? 'PASSED' : 'FAILED'}`);
      Logger.debug(`Violations: ${results.violations.length}, Warnings: ${results.warnings.length}`);

      return results;
    } catch (error) {
      Logger.error(`Failed to check constraints: ${error.message}`);
      throw error;
    }
  }

  static checkMinLoadConstraint(solution, minLoad) {
    const violations = [];
    const warnings = [];
    const routeLoads = [];

    solution.routes.forEach(route => {
      const totalLoad = this.calculateRouteLoad(route);
      routeLoads.push(totalLoad);

      if (totalLoad < minLoad) {
        violations.push({
          type: 'min_load_violation',
          vehicleId: route.vehicle,
          currentLoad: totalLoad,
          requiredLoad: minLoad,
          gap: minLoad - totalLoad,
          severity: 'high'
        });
      } else if (totalLoad < minLoad * 1.1) {
        warnings.push({
          type: 'min_load_warning',
          vehicleId: route.vehicle,
          currentLoad: totalLoad,
          requiredLoad: minLoad,
          margin: totalLoad - minLoad,
          severity: 'medium'
        });
      }
    });

    return { violations, warnings, routeLoads };
  }

  static checkMaxLoadConstraint(solution, maxLoad) {
    const violations = [];
    const warnings = [];

    solution.routes.forEach(route => {
      const totalLoad = this.calculateRouteLoad(route);

      if (totalLoad > maxLoad) {
        violations.push({
          type: 'max_load_violation',
          vehicleId: route.vehicle,
          currentLoad: totalLoad,
          maxLoad,
          excess: totalLoad - maxLoad,
          severity: 'high'
        });
      } else if (totalLoad > maxLoad * 0.9) {
        warnings.push({
          type: 'max_load_warning',
          vehicleId: route.vehicle,
          currentLoad: totalLoad,
          maxLoad,
          utilization: (totalLoad / maxLoad) * 100,
          severity: 'medium'
        });
      }
    });

    return { violations, warnings };
  }

  static checkMaxRoutesConstraint(solution, maxRoutes) {
    const violations = [];
    const warnings = [];

    const routeCount = solution.routes.length;

    if (routeCount > maxRoutes) {
      violations.push({
        type: 'max_routes_violation',
        currentRoutes: routeCount,
        maxRoutes,
        excess: routeCount - maxRoutes,
        severity: 'high'
      });
    } else if (routeCount > maxRoutes * 0.9) {
      warnings.push({
        type: 'max_routes_warning',
        currentRoutes: routeCount,
        maxRoutes,
        utilization: (routeCount / maxRoutes) * 100,
        severity: 'medium'
      });
    }

    return { violations, warnings };
  }

  static checkMaxDistanceConstraint(solution, maxDistance) {
    const violations = [];
    const warnings = [];

    solution.routes.forEach(route => {
      const totalDistance = route.summary ? route.summary.distance : 0;

      if (totalDistance > maxDistance) {
        violations.push({
          type: 'max_distance_violation',
          vehicleId: route.vehicle,
          currentDistance: totalDistance,
          maxDistance,
          excess: totalDistance - maxDistance,
          severity: 'high'
        });
      } else if (totalDistance > maxDistance * 0.9) {
        warnings.push({
          type: 'max_distance_warning',
          vehicleId: route.vehicle,
          currentDistance: totalDistance,
          maxDistance,
          utilization: (totalDistance / maxDistance) * 100,
          severity: 'medium'
        });
      }
    });

    return { violations, warnings };
  }

  static checkMaxDurationConstraint(solution, maxDuration) {
    const violations = [];
    const warnings = [];

    solution.routes.forEach(route => {
      const totalDuration = route.summary ? route.summary.duration : 0;

      if (totalDuration > maxDuration) {
        violations.push({
          type: 'max_duration_violation',
          vehicleId: route.vehicle,
          currentDuration: totalDuration,
          maxDuration,
          excess: totalDuration - maxDuration,
          severity: 'high'
        });
      } else if (totalDuration > maxDuration * 0.9) {
        warnings.push({
          type: 'max_duration_warning',
          vehicleId: route.vehicle,
          currentDuration: totalDuration,
          maxDuration,
          utilization: (totalDuration / maxDuration) * 100,
          severity: 'medium'
        });
      }
    });

    return { violations, warnings };
  }

  static calculateRouteLoad(route) {
    const jobSteps = route.steps.filter(step => step.type === 'job');
    return jobSteps.reduce((sum, step) => {
      return sum + (step.load ? step.load[0] : 0);
    }, 0);
  }

  static generateConstraintSummary(results, constraints) {
    const summary = {
      totalViolations: results.violations.length,
      totalWarnings: results.warnings.length,
      constraintTypes: Object.keys(constraints),
      complianceRate: 0,
      criticalIssues: 0,
      moderateIssues: 0
    };

    // Count issues by severity
    results.violations.forEach(violation => {
      if (violation.severity === 'high') {
        summary.criticalIssues++;
      } else {
        summary.moderateIssues++;
      }
    });

    results.warnings.forEach(warning => {
      if (warning.severity === 'high') {
        summary.criticalIssues++;
      } else {
        summary.moderateIssues++;
      }
    });

    // Calculate compliance rate (assuming each constraint type is equally weighted)
    const totalChecks = summary.constraintTypes.length;
    const passedChecks = totalChecks - summary.criticalIssues;
    summary.complianceRate = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 100;

    return summary;
  }

  static getConstraintViolationDetails(results) {
    const details = {
      byType: {},
      bySeverity: { high: [], medium: [], low: [] },
      recommendations: []
    };

    // Group violations by type
    results.violations.forEach(violation => {
      if (!details.byType[violation.type]) {
        details.byType[violation.type] = [];
      }
      details.byType[violation.type].push(violation);
    });

    // Group by severity
    results.violations.forEach(violation => {
      details.bySeverity[violation.severity].push(violation);
    });

    // Generate recommendations
    details.recommendations = this.generateRecommendations(results);

    return details;
  }

  static generateRecommendations(results) {
    const recommendations = [];

    // Analyze violations and generate specific recommendations
    const loadViolations = results.violations.filter(v => v.type.includes('load'));
    const routeViolations = results.violations.filter(v => v.type.includes('route'));
    const distanceViolations = results.violations.filter(v => v.type.includes('distance'));
    const durationViolations = results.violations.filter(v => v.type.includes('duration'));

    if (loadViolations.length > 0) {
      recommendations.push({
        type: 'load_optimization',
        priority: 'high',
        description: 'Optimize load distribution to meet capacity constraints',
        actions: [
          'Redistribute jobs between routes',
          'Adjust vehicle capacities',
          'Consider route merging for low-load routes'
        ]
      });
    }

    if (routeViolations.length > 0) {
      recommendations.push({
        type: 'route_reduction',
        priority: 'high',
        description: 'Reduce number of routes to meet maximum route constraint',
        actions: [
          'Merge compatible routes',
          'Optimize job assignments',
          'Consider vehicle capacity increases'
        ]
      });
    }

    if (distanceViolations.length > 0) {
      recommendations.push({
        type: 'distance_optimization',
        priority: 'medium',
        description: 'Optimize route distances to meet maximum distance constraint',
        actions: [
          'Reorder stops within routes',
          'Consider alternative vehicle assignments',
          'Optimize depot locations'
        ]
      });
    }

    if (durationViolations.length > 0) {
      recommendations.push({
        type: 'duration_optimization',
        priority: 'medium',
        description: 'Optimize route durations to meet maximum duration constraint',
        actions: [
          'Reduce service times where possible',
          'Optimize time windows',
          'Consider faster vehicles'
        ]
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }
}

export default ConstraintChecker; 