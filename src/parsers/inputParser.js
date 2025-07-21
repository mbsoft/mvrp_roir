import Logger from '../utils/logger.js';

class InputParser {
  static parse(inputData) {
    try {
      Logger.debug('Parsing input data...');
      
      const parsed = {
        vehicles: inputData.vehicles || [],
        jobs: inputData.jobs || [],
        shipments: inputData.shipments || [],
        locations: inputData.locations || {},
        options: inputData.options || {}
      };

      // Validate required fields
      this.validateInput(parsed);

      // Calculate summary statistics
      const summary = this.calculateSummary(parsed);
      
      Logger.info(`Parsed input: ${summary.vehicleCount} vehicles, ${summary.jobCount} jobs`);
      Logger.debug(`Total delivery capacity: ${summary.totalCapacity}`);
      Logger.debug(`Total delivery demand: ${summary.totalDemand}`);

      return {
        data: parsed,
        summary
      };
    } catch (error) {
      Logger.error(`Failed to parse input: ${error.message}`);
      throw error;
    }
  }

  static validateInput(input) {
    if (!input.vehicles || input.vehicles.length === 0) {
      throw new Error('No vehicles found in input data');
    }

    if (!input.jobs || input.jobs.length === 0) {
      throw new Error('No jobs found in input data');
    }

    if (!input.locations || !input.locations.location) {
      throw new Error('No locations found in input data');
    }

    // Validate vehicle structure
    input.vehicles.forEach((vehicle, index) => {
      if (!vehicle.id) {
        throw new Error(`Vehicle at index ${index} missing id`);
      }
      if (!vehicle.capacity || !Array.isArray(vehicle.capacity)) {
        throw new Error(`Vehicle ${vehicle.id} missing or invalid capacity`);
      }
      if (!vehicle.time_window || !Array.isArray(vehicle.time_window)) {
        throw new Error(`Vehicle ${vehicle.id} missing or invalid time_window`);
      }
    });

    // Validate job structure
    input.jobs.forEach((job, index) => {
      if (!job.id) {
        throw new Error(`Job at index ${index} missing id`);
      }
      if (!job.delivery || !Array.isArray(job.delivery)) {
        throw new Error(`Job ${job.id} missing or invalid delivery`);
      }
      if (!job.time_windows || !Array.isArray(job.time_windows)) {
        throw new Error(`Job ${job.id} missing or invalid time_windows`);
      }
    });
  }

  static calculateSummary(input) {
    const vehicleCount = input.vehicles.length;
    const jobCount = input.jobs.length;
    
    const totalCapacity = input.vehicles.reduce((sum, vehicle) => {
      return sum + (vehicle.capacity ? vehicle.capacity[0] : 0);
    }, 0);

    const totalDemand = input.jobs.reduce((sum, job) => {
      return sum + (job.delivery ? job.delivery[0] : 0);
    }, 0);

    const averageVehicleCapacity = totalCapacity / vehicleCount;
    const averageJobSize = totalDemand / jobCount;

    return {
      vehicleCount,
      jobCount,
      totalCapacity,
      totalDemand,
      averageVehicleCapacity,
      averageJobSize,
      capacityUtilization: (totalDemand / totalCapacity) * 100
    };
  }

  static getVehicleById(input, vehicleId) {
    return input.vehicles.find(v => v.id === vehicleId);
  }

  static getJobById(input, jobId) {
    return input.jobs.find(j => j.id === jobId);
  }

  static getVehiclesByTimeWindow(input, startTime, endTime) {
    return input.vehicles.filter(vehicle => {
      const [vehicleStart, vehicleEnd] = vehicle.time_window;
      return vehicleStart <= endTime && vehicleEnd >= startTime;
    });
  }

  static getJobsByTimeWindow(input, startTime, endTime) {
    return input.jobs.filter(job => {
      return job.time_windows.some(window => {
        const [jobStart, jobEnd] = window;
        return jobStart <= endTime && jobEnd >= startTime;
      });
    });
  }
}

export default InputParser; 