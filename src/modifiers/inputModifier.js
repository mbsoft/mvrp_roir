import Logger from '../utils/logger.js';

class InputModifier {
  static modifyForLoadBalancing(input, strategy, targetMinLoad = 8000) {
    try {
      Logger.debug(`Modifying input for load balancing with strategy: ${strategy.type}`);
      
      const modifiedInput = JSON.parse(JSON.stringify(input)); // Deep copy
      
      switch (strategy.type) {
        case 'objective_modification':
          return this.modifyObjective(modifiedInput, strategy);
        case 'capacity_adjustment':
          return this.modifyCapacities(modifiedInput, strategy, targetMinLoad);
        case 'vehicle_addition':
          return this.addVehicles(modifiedInput, strategy, targetMinLoad);
        case 'time_window_relaxation':
          return this.relaxTimeWindows(modifiedInput, strategy);
        case 'time_window_softening':
          return this.addTimeWindowSoftening(modifiedInput, strategy);
        default:
          throw new Error(`Unknown modification strategy: ${strategy.type}`);
      }
    } catch (error) {
      Logger.error(`Failed to modify input: ${error.message}`);
      throw error;
    }
  }

  static modifyObjective(input, strategy) {
    Logger.debug('Modifying optimization objective for load balancing');
    
    // Change from minimizing vehicles to minimizing duration or maximizing load balance
    if (strategy.objective === 'minimize_duration') {
      input.options.objective = {
        travel_cost: 'duration'
      };
    } else if (strategy.objective === 'maximize_load_balance') {
      input.options.objective = {
        travel_cost: 'distance',
        custom: {
          type: 'min-max',
          value: 'tasks'
        }
      };
    } else if (strategy.objective === 'minimize_vehicles_with_load_constraint') {
      input.options.objective = {
        travel_cost: 'distance',
        custom: {
          type: 'min',
          value: 'vehicles'
        }
      };
    }

    Logger.info(`Modified objective to: ${JSON.stringify(input.options.objective)}`);
    return input;
  }

  static modifyCapacities(input, strategy, targetMinLoad) {
    Logger.debug('Modifying vehicle capacities for load balancing');
    
    const { vehicleIds, newCapacity } = strategy;
    
    vehicleIds.forEach(vehicleId => {
      const vehicle = input.vehicles.find(v => v.id === vehicleId);
      if (vehicle) {
        const oldCapacity = vehicle.capacity[0];
        vehicle.capacity = [newCapacity];
        Logger.debug(`Modified vehicle ${vehicleId} capacity: ${oldCapacity} -> ${newCapacity}`);
      } else {
        Logger.warning(`Vehicle ${vehicleId} not found for capacity modification`);
      }
    });

    return input;
  }

  static addVehicles(input, strategy, targetMinLoad) {
    Logger.debug('Adding vehicles for load balancing');
    
    const { count, capacity, timeWindow } = strategy;
    const baseVehicleId = Math.max(...input.vehicles.map(v => parseInt(v.id))) + 1;
    
    for (let i = 0; i < count; i++) {
      const newVehicle = {
        id: (baseVehicleId + i).toString(),
        time_window: timeWindow || [1719282600, 1719315000], // Default time window
        capacity: [capacity || targetMinLoad],
        metadata: {
          added_for_load_balancing: true,
          iteration: strategy.iteration || 1
        },
        start_index: 0,
        end_index: 0
      };
      
      input.vehicles.push(newVehicle);
      Logger.debug(`Added vehicle ${newVehicle.id} with capacity ${newVehicle.capacity[0]}`);
    }

    Logger.info(`Added ${count} vehicles for load balancing`);
    return input;
  }

  static relaxTimeWindows(input, strategy) {
    Logger.debug('Relaxing time windows for better load distribution');
    
    const { relaxationMinutes = 60 } = strategy;
    
    // Relax job time windows
    input.jobs.forEach(job => {
      job.time_windows = job.time_windows.map(window => {
        const [start, end] = window;
        return [
          start - (relaxationMinutes * 60), // Convert minutes to seconds
          end + (relaxationMinutes * 60)
        ];
      });
    });

    // Relax vehicle time windows
    input.vehicles.forEach(vehicle => {
      const [start, end] = vehicle.time_window;
      vehicle.time_window = [
        start - (relaxationMinutes * 60),
        end + (relaxationMinutes * 60)
      ];
    });

    Logger.info(`Relaxed time windows by ${relaxationMinutes} minutes`);
    return input;
  }

  static addTimeWindowSoftening(input, strategy) {
    Logger.debug('Adding time window softening constraints');
    
    if (!input.options.constraint) {
      input.options.constraint = {};
    }

    // Convert relaxation minutes to seconds for API constraints
    const relaxationSeconds = (strategy.relaxationMinutes || 60) * 60;
    
    // Add vehicle overtime constraint (allows vehicles to work beyond their time window)
    input.options.constraint.max_vehicle_overtime = relaxationSeconds;
    
    // Add visit lateness constraint (allows jobs to be completed after their time window)
    input.options.constraint.max_visit_lateness = Math.min(relaxationSeconds, 1800); // Cap at 30 minutes for visit lateness

    Logger.info(`Added time window softening: max_vehicle_overtime=${relaxationSeconds}s, max_visit_lateness=${Math.min(relaxationSeconds, 1800)}s`);
    return input;
  }

  static createLoadBalancingStrategy(analysis, iteration = 1, successfulIteration = 0) {
    Logger.debug('Creating load balancing strategy based on analysis');
    
    const strategies = [];

    // Strategy 1: Vary objective based on iteration and compliance rate
    if (analysis.summary.complianceRate < 30) {
      // Very low compliance - try different objectives
      const objectives = ['maximize_load_balance', 'minimize_vehicles_with_load_constraint', 'minimize_duration'];
      const selectedObjective = objectives[iteration % objectives.length];
      strategies.push({
        type: 'objective_modification',
        objective: selectedObjective,
        priority: 'high',
        description: `Change objective to ${selectedObjective} (iteration ${iteration})`
      });
    } else if (analysis.summary.complianceRate < 50) {
      strategies.push({
        type: 'objective_modification',
        objective: 'maximize_load_balance',
        priority: 'high',
        description: 'Change objective to maximize load balance'
      });
    }

    // Strategy 2: Vary time window softening based on iteration
    const relaxationMinutes = [30, 45, 60, 15, 90, 120];
    const selectedRelaxation = relaxationMinutes[iteration % relaxationMinutes.length];
    strategies.push({
      type: 'time_window_softening',
      relaxationMinutes: selectedRelaxation,
      priority: 'high',
      description: `Add time window softening with ${selectedRelaxation} minutes relaxation`
    });

    // Strategy 3: Add vehicles with varying capacity and count
    if (analysis.routesBelowTarget.length > analysis.routesAboveTarget.length * 0.5) {
      const neededVehicles = Math.ceil(analysis.summary.totalLoadGap / 12000);
      const capacities = [14000, 12000, 16000, 10000, 18000];
      const selectedCapacity = capacities[iteration % capacities.length];
      const vehicleCount = Math.min(neededVehicles + (iteration % 3), 15); // Vary count based on iteration
      
      strategies.push({
        type: 'vehicle_addition',
        count: vehicleCount,
        capacity: selectedCapacity,
        timeWindow: [1719282600, 1719315000],
        iteration,
        priority: 'medium',
        description: `Add ${vehicleCount} vehicles with ${selectedCapacity} capacity (iteration ${iteration})`
      });
    }





    return strategies.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  static createRelaxedLoadBalancingStrategy(analysis, iteration = 1, successfulIteration = 0) {
    Logger.debug('Creating relaxed load balancing strategy based on analysis');
    
    const strategies = [];

    // Strategy 1: More aggressive time window softening
    strategies.push({
      type: 'time_window_softening',
      relaxationMinutes: 120, // 2 hours of relaxation
      priority: 'high',
      description: 'Add aggressive time window softening with 120 minutes relaxation'
    });

    // Strategy 2: Add more vehicles with lower capacity
    const neededVehicles = Math.ceil(analysis.summary.totalLoadGap / 8000); // Lower capacity requirement
    strategies.push({
      type: 'vehicle_addition',
      count: Math.min(neededVehicles + 5, 15), // Add more vehicles
      capacity: 10000, // Lower capacity
      timeWindow: [1719282600, 1719315000],
      iteration,
      priority: 'high',
      description: `Add ${Math.min(neededVehicles + 5, 15)} vehicles with lower capacity`
    });

    // Strategy 3: Relax time windows more aggressively
    strategies.push({
      type: 'time_window_relaxation',
      relaxationMinutes: 60, // More relaxation
      priority: 'medium',
      description: 'Relax time windows more aggressively for better job assignment'
    });

    // Strategy 4: Use simpler objective (minimize vehicles instead of load balance)
    strategies.push({
      type: 'objective_modification',
      objective: 'minimize_vehicles_with_load_constraint',
      priority: 'medium',
      description: 'Use simpler objective to minimize vehicles'
    });

    return strategies.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  static applyMultipleStrategies(input, strategies) {
    Logger.debug(`Applying ${strategies.length} modification strategies`);
    
    let modifiedInput = JSON.parse(JSON.stringify(input));
    
    strategies.forEach((strategy, index) => {
      Logger.debug(`Applying strategy ${index + 1}: ${strategy.type}`);
      modifiedInput = this.modifyForLoadBalancing(modifiedInput, strategy);
    });

    return modifiedInput;
  }

  static validateModifiedInput(input) {
    Logger.debug('Validating modified input');
    
    const errors = [];

    // Check vehicle capacities
    input.vehicles.forEach(vehicle => {
      if (vehicle.capacity[0] <= 0) {
        errors.push(`Vehicle ${vehicle.id} has invalid capacity: ${vehicle.capacity[0]}`);
      }
    });

    // Check time windows
    input.vehicles.forEach(vehicle => {
      const [start, end] = vehicle.time_window;
      if (start >= end) {
        errors.push(`Vehicle ${vehicle.id} has invalid time window: ${start} >= ${end}`);
      }
    });

    // Check job time windows
    input.jobs.forEach(job => {
      job.time_windows.forEach((window, index) => {
        const [start, end] = window;
        if (start >= end) {
          errors.push(`Job ${job.id} time window ${index} is invalid: ${start} >= ${end}`);
        }
      });
    });

    if (errors.length > 0) {
      throw new Error(`Input validation failed:\n${errors.join('\n')}`);
    }

    Logger.info('Modified input validation passed');
    return true;
  }

  static generateModificationReport(originalInput, modifiedInput, strategies) {
    const report = {
      strategiesApplied: strategies,
      changes: {
        vehicles: {
          original: originalInput.vehicles.length,
          modified: modifiedInput.vehicles.length,
          added: modifiedInput.vehicles.length - originalInput.vehicles.length
        },
        objective: {
          original: originalInput.options.objective,
          modified: modifiedInput.options.objective
        },
        constraints: {
          original: originalInput.options.constraint || {},
          modified: modifiedInput.options.constraint || {}
        }
      },
      summary: {
        totalStrategies: strategies.length,
        highPriorityStrategies: strategies.filter(s => s.priority === 'high').length,
        mediumPriorityStrategies: strategies.filter(s => s.priority === 'medium').length,
        lowPriorityStrategies: strategies.filter(s => s.priority === 'low').length
      }
    };

    Logger.info(`Modification report: ${report.changes.vehicles.added} vehicles added, ${report.summary.totalStrategies} strategies applied`);
    return report;
  }
}

export default InputModifier; 