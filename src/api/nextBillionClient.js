import axios from 'axios';
import Logger from '../utils/logger.js';

class NextBillionClient {
  constructor(apiKey, baseUrl = 'https://api.nextbillion.io') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 300000 // 5 minutes timeout
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        Logger.error(`API request failed: ${error.message}`);
        if (error.response) {
          Logger.error(`Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
      }
    );
  }

  async submitOptimization(inputData, options = {}) {
    try {
      Logger.info('Submitting optimization request to NextBillion.ai');
      Logger.debug(`Input data: ${inputData.vehicles?.length} vehicles, ${inputData.jobs?.length} jobs`);

      const requestData = {
        ...inputData,
        options: {
          ...inputData.options,
          ...options
        }
      };



      const response = await this.client.post(`/optimization/v2?key=${this.apiKey}`, requestData);
      
      Logger.success('Optimization request submitted successfully');
      Logger.debug(`Response status: ${response.status}`);
      
      return {
        success: true,
        data: response.data,
        requestId: response.data.id || null
      };
    } catch (error) {
      Logger.error(`Failed to submit optimization: ${error.message}`);
      return {
        success: false,
        error: error.message,
        originalError: error,
        data: null
      };
    }
  }

  async getOptimizationStatus(requestId) {
    try {
      Logger.debug(`Checking optimization status for request: ${requestId}`);
      
      const response = await this.client.get(`/optimization/v2/result?id=${requestId}&key=${this.apiKey}`);
      
      // Check if the response indicates the optimization is still processing
      if (response.data.message && response.data.message.includes('Job still processing')) {
        Logger.debug('Optimization still processing detected');
        return {
          success: true,
          status: 'processing',
          data: response.data
        };
      }
      
      // Check if the optimization has completed successfully
      if (response.data.status === 'Ok' && response.data.result && response.data.result.routes) {
        return {
          success: true,
          status: 'completed',
          data: response.data
        };
      }
      
      // Check if there was an error
      if (response.data.status === 'Error') {
        return {
          success: true,
          status: 'failed',
          data: response.data,
          error: response.data.message || 'Optimization failed'
        };
      }
      
      // If we get here, the response is unexpected
      Logger.debug(`Unexpected response format: ${JSON.stringify(response.data)}`);
      return {
        success: true,
        status: 'unknown',
        data: response.data
      };
    } catch (error) {
      Logger.error(`Failed to get optimization status: ${error.message}`);
      return {
        success: false,
        error: error.message,
        status: 'unknown'
      };
    }
  }

  async getOptimizationResult(requestId, existingData = null) {
    try {
      Logger.info(`Retrieving optimization result for request: ${requestId}`);
      
      // If we already have the data from a previous status check, use it
      if (existingData) {
        Logger.success('Optimization result retrieved successfully (from cached data)');
        return {
          success: true,
          data: existingData,
          solution: existingData.result || null
        };
      }
      
      const response = await this.client.get(`/optimization/v2/result?id=${requestId}&key=${this.apiKey}`);
      
      Logger.success('Optimization result retrieved successfully');
      
      return {
        success: true,
        data: response.data,
        solution: response.data.result || null
      };
    } catch (error) {
      Logger.error(`Failed to get optimization result: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  async waitForOptimization(requestId, maxWaitTime = 600000) { // 10 minutes default
    try {
      Logger.info(`Waiting for optimization to complete: ${requestId}`);
      
      const startTime = Date.now();
      const checkInterval = 10000; // Check every 10 seconds
      
      let pollCount = 0;
      while (Date.now() - startTime < maxWaitTime) {
        pollCount++;
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        Logger.debug(`Polling attempt ${pollCount} (${elapsedSeconds}s elapsed)`);
        
        const statusResponse = await this.getOptimizationStatus(requestId);
        
        if (!statusResponse.success) {
          throw new Error(`Failed to check status: ${statusResponse.error}`);
        }
        
        const status = statusResponse.status;
        Logger.debug(`Optimization status: ${status}`);
        
        if (status === 'completed') {
          Logger.success('Optimization completed successfully');
          return await this.getOptimizationResult(requestId, statusResponse.data);
        } else if (status === 'failed') {
          const errorMessage = statusResponse.error || 'Optimization failed';
          throw new Error(errorMessage);
        } else if (status === 'processing') {
          Logger.debug('Optimization still processing, waiting...');
          // Continue polling
        } else if (status === 'cancelled') {
          throw new Error('Optimization was cancelled');
        } else {
          Logger.warning(`Unknown optimization status: ${status}, continuing to poll...`);
        }
        
        // Wait before next check
        await this.sleep(checkInterval);
      }
      
      throw new Error(`Optimization timeout after ${maxWaitTime / 1000} seconds`);
    } catch (error) {
      Logger.error(`Error waiting for optimization: ${error.message}`);
      throw error;
    }
  }

  async runOptimization(inputData, options = {}) {
    try {
      Logger.info('Starting complete optimization process');
      
      // Step 1: Submit optimization request
      const submitResponse = await this.submitOptimization(inputData, options);
      
      if (!submitResponse.success) {
        // Preserve the original error details
        const error = new Error(`Failed to submit optimization: ${submitResponse.error}`);
        if (submitResponse.originalError) {
          error.originalError = submitResponse.originalError;
        }
        throw error;
      }
      
      const requestId = submitResponse.requestId;
      if (!requestId) {
        throw new Error('No request ID received from optimization submission');
      }
      
      // Step 2: Wait for completion
      const resultResponse = await this.waitForOptimization(requestId);
      
      if (!resultResponse.success) {
        throw new Error(`Failed to get optimization result: ${resultResponse.error}`);
      }
      
      Logger.success('Optimization process completed successfully');
      return resultResponse;
      
    } catch (error) {
      Logger.error(`Optimization process failed: ${error.message}`);
      throw error;
    }
  }

  // Note: validateInput and getApiQuota methods are not available in the current API version
  // These methods have been removed as they use endpoints that don't exist in the API spec

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper method to create a mock response for testing
  createMockResponse(inputData) {
    Logger.warning('Using mock response - this should only be used for testing');
    
    // Create a simple mock solution
    const mockSolution = {
      routes: inputData.vehicles.slice(0, 5).map((vehicle, index) => ({
        vehicle: vehicle.id,
        steps: inputData.jobs.slice(index * 3, (index + 1) * 3).map(job => ({
          type: 'job',
          job_id: job.id,
          load: job.delivery,
          location: job.location_index,
          arrival: 0,
          departure: 0
        })),
        summary: {
          distance: 1000 + Math.random() * 5000,
          duration: 3600 + Math.random() * 7200
        }
      })),
      unassigned: [],
      summary: {
        total_distance: 15000,
        total_duration: 18000,
        total_load: 50000
      }
    };

    return {
      success: true,
      data: {
        request_id: `mock_${Date.now()}`,
        solution: mockSolution
      },
      solution: mockSolution
    };
  }
}

export default NextBillionClient; 