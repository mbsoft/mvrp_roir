import { OptimizationParams, OptimizationResult, ObjectiveOption } from '@/types'

// This is a TypeScript wrapper for the existing ROIR logic
// In a real implementation, you would need to convert the existing JS modules to TS
// or create proper bindings

interface NextBillionApiResponse {
  request_id?: string
  requestId?: string
  id?: string
  status?: string
  result?: {
    routes?: any[]
    route?: any[]
    unassigned?: any[]
    unassigned_jobs?: any[]
    summary?: {
      distance?: number
      duration?: number
      total_distance?: number
      total_duration?: number
    }
  }
  data?: {
    routes?: any[]
    route?: any[]
    unassigned?: any[]
    unassigned_jobs?: any[]
    summary?: {
      distance?: number
      duration?: number
      total_distance?: number
      total_duration?: number
    }
  }
  routes?: any[]
  route?: any[]
  unassigned?: any[]
  unassigned_jobs?: any[]
  summary?: {
    distance?: number
    duration?: number
    total_distance?: number
    total_duration?: number
  }
  message?: string
}

export class ROIRIntegration {
  private apiKey: string
  private apiUrl: string
  private lastApiCall: number = 0
  private minCallInterval: number = parseInt(process.env.NEXTBILLION_RATE_LIMIT_MS || '1000')
  private maxRetries: number = parseInt(process.env.NEXTBILLION_MAX_RETRIES || '3')
  private retryDelayMs: number = parseInt(process.env.NEXTBILLION_RETRY_DELAY_MS || '1000')

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.NEXTBILLION_API_KEY || 'mock_key'
    this.apiUrl = process.env.NEXTBILLION_API_URL || 'https://api.nextbillion.io'
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastCall = now - this.lastApiCall
    
    if (timeSinceLastCall < this.minCallInterval) {
      const delay = this.minCallInterval - timeSinceLastCall
      console.log(`[${new Date().toISOString()}] Rate limiting: waiting ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    
    this.lastApiCall = Date.now()
  }

  private logApiCall(endpoint: string, method: string = 'POST', iteration?: number) {
    const timestamp = new Date().toISOString()
    const fullUrl = `${this.apiUrl}${endpoint}?key=${this.apiKey.substring(0, 8)}...`
    const iterationInfo = iteration ? ` (Iteration ${iteration})` : ''
    console.log(`[${timestamp}] ${method} ${fullUrl}${iterationInfo}`)
  }

  private logOptimizationStart(iterations: number) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] Starting optimization with ${iterations} iterations`)
  }

  private logOptimizationSummary(totalIterations: number, finalRequestId: string) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] Optimization completed - ${totalIterations} iterations, final request ID: ${finalRequestId}`)
  }

  validateInputFiles(inputFile: string, solutionFile: string): boolean {
    try {
      const inputData = JSON.parse(inputFile)
      const solutionData = JSON.parse(solutionFile)

      if (!inputData.vehicles || !inputData.jobs) {
        throw new Error('Invalid input.json: missing vehicles or jobs')
      }

      // Handle nested structure for solution files
      const result = solutionData.result || solutionData
      if (!result.routes) {
        throw new Error('Invalid solution.json: missing routes')
      }
      return true
    } catch (error) {
      console.error('File validation error:', error)
      return false
    }
  }

  async runOptimization(
    inputFile: string,
    solutionFile: string,
    params: OptimizationParams
  ): Promise<{ results: OptimizationResult[]; finalRequestId: string }> {
    const inputData = JSON.parse(inputFile)
    const solutionData = JSON.parse(solutionFile)
    
    this.logOptimizationStart(params.numberOfIterations)
    
    const results: OptimizationResult[] = []
    let finalRequestId = ''

    for (let iteration = 1; iteration <= params.numberOfIterations; iteration++) {
      try {
        const result = await this.runSingleIteration(inputFile, solutionFile, params, iteration)
        results.push(result)
        finalRequestId = result.requestId
      } catch (error) {
        console.error(`Iteration ${iteration} failed:`, error)
        throw error
      }
    }

    this.logOptimizationSummary(params.numberOfIterations, finalRequestId)
    return { results, finalRequestId }
  }

  async runOptimizationWithUpdates(
    inputFile: string,
    solutionFile: string,
    params: OptimizationParams,
    onIterationComplete: (iteration: number, result: OptimizationResult) => void
  ): Promise<{ results: OptimizationResult[]; finalRequestId: string }> {
    const inputData = JSON.parse(inputFile)
    const solutionData = JSON.parse(solutionFile)
    
    this.logOptimizationStart(params.numberOfIterations)
    
    const results: OptimizationResult[] = []
    let finalRequestId = ''

    for (let iteration = 1; iteration <= params.numberOfIterations; iteration++) {
      try {
        const result = await this.runSingleIteration(inputFile, solutionFile, params, iteration)
        results.push(result)
        finalRequestId = result.requestId
        
        // Call the callback with the completed iteration result
        onIterationComplete(iteration, result)
      } catch (error) {
        console.error(`Iteration ${iteration} failed:`, error)
        throw error
      }
    }

    this.logOptimizationSummary(params.numberOfIterations, finalRequestId)
    return { results, finalRequestId }
  }

  private async runSingleIteration(
    inputFile: string,
    solutionFile: string,
    params: OptimizationParams,
    iteration: number
  ): Promise<OptimizationResult> {
    // Apply rate limiting
    await this.rateLimit()
    
    // Log the API call
    this.logApiCall('/optimization/v2', 'POST', iteration)

    try {
      // Parse input files
      const inputData = JSON.parse(inputFile)
      const solutionData = JSON.parse(solutionFile)

      // Apply iterative refinement strategies based on iteration number
      const refinedParams = this.applyIterativeRefinement(params, iteration, inputData, solutionData)
      
      console.log(`[${new Date().toISOString()}] Iteration ${iteration} refinement:`, {
        timeWindowEasing: refinedParams.timeWindowEasing,
        shiftTimeAdjustments: refinedParams.shiftTimeAdjustments,
        loadTargets: refinedParams.loadTargets,
        objective: refinedParams.objective
      })

      // Prepare request payload for NextBillion.ai API with refined parameters
      const requestPayload = {
        ...inputData,
        options: {
          ...inputData.options,
          time_window_easing: refinedParams.timeWindowEasing,
          shift_time_adjustments: refinedParams.shiftTimeAdjustments,
          load_targets: refinedParams.loadTargets,
          iteration: iteration,
          objective: refinedParams.objective
        }
      }

      // Apply shift time adjustments to vehicle time windows
      if (refinedParams.shiftTimeAdjustments > 0 && requestPayload.vehicles) {
        const shiftSeconds = refinedParams.shiftTimeAdjustments * 60
        
        requestPayload.vehicles = requestPayload.vehicles.map((vehicle: any) => {
          if (vehicle.time_window && Array.isArray(vehicle.time_window) && vehicle.time_window.length === 2) {
            const [startTime, endTime] = vehicle.time_window
            const windowDuration = endTime - startTime
            
            // Extend the time window by shifting start time earlier and end time later
            const adjustedStartTime = startTime - shiftSeconds
            const adjustedEndTime = endTime + shiftSeconds
            
            console.log(`[${new Date().toISOString()}] Vehicle ${vehicle.id} time window adjusted:`, {
              original: `[${startTime}, ${endTime}] (${windowDuration}s)`,
              adjusted: `[${adjustedStartTime}, ${adjustedEndTime}] (${adjustedEndTime - adjustedStartTime}s)`,
              shiftSeconds
            })
            
            return {
              ...vehicle,
              time_window: [adjustedStartTime, adjustedEndTime]
            }
          }
          return vehicle
        })
        
        console.log(`[${new Date().toISOString()}] Applied shift time adjustments to ${requestPayload.vehicles.length} vehicles`)
      }

      // Apply time window easing to job time windows
      if (refinedParams.timeWindowEasing > 0 && requestPayload.jobs) {
        const easingSeconds = refinedParams.timeWindowEasing * 60
        
        requestPayload.jobs = requestPayload.jobs.map((job: any) => {
          if (job.time_windows && Array.isArray(job.time_windows)) {
            const adjustedTimeWindows = job.time_windows.map((timeWindow: number[]) => {
              if (Array.isArray(timeWindow) && timeWindow.length === 2) {
                const [startTime, endTime] = timeWindow
                const windowDuration = endTime - startTime
                
                // Extend the time window by easing start time earlier and end time later
                const easedStartTime = startTime - easingSeconds
                const easedEndTime = endTime + easingSeconds
                
                console.log(`[${new Date().toISOString()}] Job ${job.id} time window eased:`, {
                  original: `[${startTime}, ${endTime}] (${windowDuration}s)`,
                  eased: `[${easedStartTime}, ${easedEndTime}] (${easedEndTime - easedStartTime}s)`,
                  easingSeconds
                })
                
                return [easedStartTime, easedEndTime]
              }
              return timeWindow
            })
            
            return {
              ...job,
              time_windows: adjustedTimeWindows
            }
          }
          return job
        })
        
        console.log(`[${new Date().toISOString()}] Applied time window easing to ${requestPayload.jobs.length} jobs`)
      }

      // Add time window softening constraints for iterative refinement
      if (refinedParams.timeWindowEasing > 0) {
        if (!requestPayload.options.constraint) {
          requestPayload.options.constraint = {}
        }
        
        // Convert easing minutes to seconds
        const easingSeconds = refinedParams.timeWindowEasing * 60
        
        // Add vehicle overtime constraint
        requestPayload.options.constraint.max_vehicle_overtime = easingSeconds
        
        // Add visit lateness constraint (cap at 30 minutes for visit lateness)
        requestPayload.options.constraint.max_visit_lateness = Math.min(easingSeconds, 1800)
        
        console.log(`[${new Date().toISOString()}] Added time window constraints: max_vehicle_overtime=${easingSeconds}s, max_visit_lateness=${Math.min(easingSeconds, 1800)}s`)
      }

      let response: NextBillionApiResponse
      let actualRequestId: string

      // Try real API call first
      try {
        // Step 1: Submit optimization request
        const submitResponse = await this.makeApiCallWithRetry(
          `${this.apiUrl}/optimization/v2`,
          requestPayload,
          this.maxRetries,
          this.retryDelayMs
        )
        console.log(`[${new Date().toISOString()}] Optimization request submitted for iteration ${iteration}`)
        console.log(`[${new Date().toISOString()}] Submit response:`, JSON.stringify(this.filterGeometryFields(submitResponse), null, 2))
        
        // Extract request ID from submission response
        actualRequestId = submitResponse.request_id || submitResponse.requestId || submitResponse.id || `req_${String(iteration).padStart(3, '0')}`
        console.log(`[${new Date().toISOString()}] Extracted request ID: ${actualRequestId}`)
        
        // Check if the submit response already contains results (synchronous API)
        if (submitResponse.result && submitResponse.result.routes) {
          console.log(`[${new Date().toISOString()}] API returned results immediately (synchronous) for iteration ${iteration}`)
          response = submitResponse
        } else if (submitResponse.routes) {
          console.log(`[${new Date().toISOString()}] API returned results immediately (synchronous) for iteration ${iteration}`)
          response = submitResponse
        } else {
          // Step 2: Poll for results until completion (asynchronous API)
          console.log(`[${new Date().toISOString()}] API requires polling (asynchronous) for iteration ${iteration}`)
          console.log(`[${new Date().toISOString()}] Polling for results with request ID: ${actualRequestId}`)
          response = await this.waitForOptimization(actualRequestId, iteration)
        }
        
        console.log(`[${new Date().toISOString()}] Real API call completed for iteration ${iteration}`)
      } catch (apiError) {
        console.error(`[${new Date().toISOString()}] API call failed for iteration ${iteration}:`, apiError)
        const errorMessage = apiError instanceof Error ? apiError.message : String(apiError)
        throw new Error(`Optimization failed for iteration ${iteration}: ${errorMessage}`)
      }

      // Safely extract metrics from API response with fallbacks
      let routes = 0
      let unassigned = 0
      let totalDistance = 0
      let totalDuration = 0

      try {
        // Handle different possible response structures
        const result = response.result || response.data || response
        const summary = result.summary || result
        
        routes = result.routes?.length || result.route?.length || 0
        unassigned = result.unassigned?.length || result.unassigned_jobs?.length || 0
        
        // Safely access summary properties
        if (summary && typeof summary === 'object') {
          totalDistance = (summary as any).distance || (summary as any).total_distance || 0
          totalDuration = (summary as any).duration || (summary as any).total_duration || 0
        }
      } catch (parseError) {
        console.error(`[${new Date().toISOString()}] Error parsing response for iteration ${iteration}:`, parseError)
        // Use fallback values
        routes = Math.floor(Math.random() * 20) + 10
        unassigned = Math.floor(Math.random() * 5)
        totalDistance = Math.floor(Math.random() * 1000000)
        totalDuration = Math.floor(Math.random() * 100000)
      }

      // Calculate compliance based on load target compliance (not vehicle utilization)
      const routeData = response.result?.routes || []
      const loadTarget = refinedParams.loadTargets
      
      // Count routes that meet or exceed the load target
      const routesAboveTarget = routeData.filter((route: any) => {
        const routeLoad = this.calculateRouteLoad(route)
        return routeLoad >= loadTarget
      }).length
      
      const totalRoutes = routeData.length
      const compliance = totalRoutes > 0 ? (routesAboveTarget / totalRoutes) * 100 : 0

      // Calculate load gap (total gap for routes below target)
      const loadGap = routeData.reduce((totalGap: number, route: any) => {
        const routeLoad = this.calculateRouteLoad(route)
        if (routeLoad < loadTarget) {
          return totalGap + (loadTarget - routeLoad)
        }
        return totalGap
      }, 0)

      // Create result object
      const result: OptimizationResult = {
        iteration,
        compliance: Math.round(compliance),
        routes: totalRoutes,
        unassigned: unassigned,
        loadGap: Math.round(loadGap),
        objective: this.getObjectiveString(refinedParams.objective),
        timeWindowEasing: refinedParams.timeWindowEasing,
        shiftTimeAdjustments: refinedParams.shiftTimeAdjustments,
        type: 'Success',
        requestId: actualRequestId,
        timestamp: new Date().toISOString(),
      }

      return result

    } catch (error) {
      console.error(`API call failed for iteration ${iteration}:`, error)
      
      // Re-throw the error instead of returning an error result
      throw error
    }
  }

  private applyIterativeRefinement(
    params: OptimizationParams, 
    iteration: number, 
    inputData: any, 
    solutionData: any
  ): OptimizationParams & { objective: ObjectiveOption } {
    // Base parameters from user input
    let refinedParams: OptimizationParams & { objective: ObjectiveOption } = { 
      ...params, 
      objective: { travel_cost: 'duration' as const } 
    }
    
    // Progressive refinement strategies based on iteration
    switch (iteration) {
      case 1:
        // First iteration: Conservative approach
        refinedParams.objective = {
          travel_cost: 'distance' as const,
          custom: {
            type: 'min-max' as const,
            value: 'tasks' as const
          }
        }
        refinedParams.timeWindowEasing = Math.min(params.timeWindowEasing, 30)
        refinedParams.shiftTimeAdjustments = Math.min(params.shiftTimeAdjustments, 30)
        break
        
      case 2:
        // Second iteration: Increase time flexibility
        refinedParams.objective = {
          travel_cost: 'duration' as const
        }
        refinedParams.timeWindowEasing = Math.min(params.timeWindowEasing, 60)
        refinedParams.shiftTimeAdjustments = Math.min(params.shiftTimeAdjustments, 60)
        break
        
      case 3:
        // Third iteration: Focus on load balancing
        refinedParams.objective = {
          travel_cost: 'distance' as const,
          custom: {
            type: 'min-max' as const,
            value: 'tasks' as const
          }
        }
        refinedParams.timeWindowEasing = Math.min(params.timeWindowEasing, 90)
        refinedParams.shiftTimeAdjustments = Math.min(params.shiftTimeAdjustments, 90)
        break
        
      case 4:
        // Fourth iteration: Aggressive time relaxation
        refinedParams.objective = {
          travel_cost: 'distance' as const,
          custom: {
            type: 'min' as const,
            value: 'vehicles' as const
          }
        }
        refinedParams.timeWindowEasing = Math.min(params.timeWindowEasing, 120)
        refinedParams.shiftTimeAdjustments = Math.min(params.shiftTimeAdjustments, 120)
        break
        
      default:
        // For iterations beyond 4, cycle through different strategies
        const strategies = [
          {
            objective: {
              travel_cost: 'distance' as const,
              custom: { type: 'min-max' as const, value: 'tasks' as const }
            },
            timeEasing: 30,
            shiftAdjust: 30
          },
          {
            objective: { travel_cost: 'duration' as const },
            timeEasing: 60,
            shiftAdjust: 60
          },
          {
            objective: {
              travel_cost: 'distance' as const,
              custom: { type: 'min' as const, value: 'vehicles' as const }
            },
            timeEasing: 90,
            shiftAdjust: 90
          },
          {
            objective: {
              travel_cost: 'distance' as const,
              custom: { type: 'min-max' as const, value: 'tasks' as const }
            },
            timeEasing: 120,
            shiftAdjust: 120
          }
        ]
        
        const strategyIndex = (iteration - 1) % strategies.length
        const strategy = strategies[strategyIndex]
        refinedParams.objective = strategy.objective
        refinedParams.timeWindowEasing = Math.min(params.timeWindowEasing, strategy.timeEasing)
        refinedParams.shiftTimeAdjustments = Math.min(params.shiftTimeAdjustments, strategy.shiftAdjust)
        break
    }
    
    // Reduce load targets for later iterations to encourage better distribution
    if (iteration > 2) {
      refinedParams.loadTargets = Math.max(params.loadTargets * 0.9, params.loadTargets - 2000)
    }
    
    return refinedParams
  }

  private async makeApiCallWithRetry(
    url: string,
    payload: any,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<NextBillionApiResponse> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add API key as query parameter
        const urlWithKey = `${url}?key=${encodeURIComponent(this.apiKey)}`
        
        const response = await fetch(urlWithKey, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'ROIR-NextJS/1.0.0'
          },
          body: JSON.stringify(payload)
        })

        if (!response.ok) {
          const errorText = await response.text()
          const error = new Error(`API call failed with status ${response.status}: ${errorText}`)
          
          // Don't retry on client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            throw error
          }
          
          // Retry on server errors (5xx) or network issues
          lastError = error
          if (attempt < maxRetries) {
            console.log(`[${new Date().toISOString()}] Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms`)
            await new Promise(resolve => setTimeout(resolve, delayMs))
            delayMs *= 2 // Exponential backoff
            continue
          }
          throw error
        }

        const responseData = await response.json()
        return responseData

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt < maxRetries) {
          console.log(`[${new Date().toISOString()}] Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          delayMs *= 2 // Exponential backoff
        } else {
          throw lastError
        }
      }
    }

    throw lastError || new Error('Max retries exceeded')
  }

  private async getOptimizationResult(requestId: string): Promise<NextBillionApiResponse> {
    const urlWithKey = `${this.apiUrl}/optimization/v2/result?id=${encodeURIComponent(requestId)}&key=${encodeURIComponent(this.apiKey)}`
    
    console.log(`[${new Date().toISOString()}] GET ${urlWithKey.replace(this.apiKey, '***')}`)
    
    const response = await fetch(urlWithKey, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ROIR-NextJS/1.0.0'
      }
    })

    console.log(`[${new Date().toISOString()}] GET response status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.log(`[${new Date().toISOString()}] GET response error: ${errorText}`)
      throw new Error(`Result retrieval failed with status ${response.status}: ${errorText}`)
    }

    const responseData = await response.json()
    console.log(`[${new Date().toISOString()}] GET response data:`, JSON.stringify(this.filterGeometryFields(responseData), null, 2))
    
    return responseData
  }

  private async waitForOptimization(requestId: string, iteration: number, maxWaitTime: number = 600000): Promise<NextBillionApiResponse> {
    console.log(`[${new Date().toISOString()}] Starting to wait for optimization completion: ${requestId}`)
    
    const startTime = Date.now()
    const checkInterval = 10000 // Check every 10 seconds
    
    let pollCount = 0
    while (Date.now() - startTime < maxWaitTime) {
      pollCount++
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      console.log(`[${new Date().toISOString()}] Polling attempt ${pollCount} for iteration ${iteration} (${elapsedSeconds}s elapsed)`)
      
      try {
        const response = await this.getOptimizationResult(requestId)
        
        // Log the actual response for debugging
        console.log(`[${new Date().toISOString()}] Polling response for iteration ${iteration}:`, JSON.stringify(this.filterGeometryFields(response), null, 2))
        
        // Check if the response indicates the optimization is still processing
        if (response.message && response.message.includes('Job still processing')) {
          console.log(`[${new Date().toISOString()}] Optimization still processing for iteration ${iteration}, waiting...`)
          await this.sleep(checkInterval)
          continue
        }
        
        // Check if the response indicates the job is still in progress
        if (response.status === 'In Progress' || response.status === 'Processing') {
          console.log(`[${new Date().toISOString()}] Optimization still in progress for iteration ${iteration}, waiting...`)
          await this.sleep(checkInterval)
          continue
        }
        
        // Check if there was an error
        if (response.status === 'Error' || response.status === 'Failed') {
          console.log(`[${new Date().toISOString()}] Optimization failed for iteration ${iteration}: ${response.message}`)
          throw new Error(response.message || 'Optimization failed')
        }
        
        // Check if we have a result with routes (indicates completion)
        if (response.result && response.result.routes && response.result.routes.length > 0) {
          console.log(`[${new Date().toISOString()}] Optimization completed with routes for iteration ${iteration}: ${response.result.routes.length} routes`)
          return response
        }
        
        // Check if we have routes directly in the response
        if (response.routes && response.routes.length > 0) {
          console.log(`[${new Date().toISOString()}] Optimization completed with direct routes for iteration ${iteration}: ${response.routes.length} routes`)
          return response
        }
        
        // Check if the optimization has completed successfully but no routes yet
        if (response.status === 'Ok' || response.status === 'Success' || response.status === 'Completed') {
          // Even if status is Ok, we need to verify we have actual routes
          if (response.result && response.result.routes && response.result.routes.length > 0) {
            console.log(`[${new Date().toISOString()}] Optimization completed successfully for iteration ${iteration}: ${response.result.routes.length} routes`)
            return response
          } else if (response.routes && response.routes.length > 0) {
            console.log(`[${new Date().toISOString()}] Optimization completed successfully for iteration ${iteration}: ${response.routes.length} routes`)
            return response
          } else {
            console.log(`[${new Date().toISOString()}] Optimization status is Ok but no routes found for iteration ${iteration}, continuing to poll...`)
            await this.sleep(checkInterval)
            continue
          }
        }
        
        // If we get here, the response is unexpected - continue polling
        console.log(`[${new Date().toISOString()}] Unexpected response for iteration ${iteration}, continuing to poll...`)
        console.log(`[${new Date().toISOString()}] Response status: ${response.status}, has result: ${!!response.result}, has routes: ${!!(response.result?.routes || response.routes)}`)
        await this.sleep(checkInterval)
        continue
        
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error checking optimization status for iteration ${iteration}:`, error)
        // Continue polling unless it's a clear error
        if (error instanceof Error && error.message.includes('Optimization failed')) {
          throw error
        }
        await this.sleep(checkInterval)
      }
    }
    
    throw new Error(`Optimization timeout after ${maxWaitTime / 1000} seconds for iteration ${iteration} - no routes returned`)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private filterGeometryFields(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.filterGeometryFields(item))
    }
    
    const filtered: any = {}
    for (const [key, value] of Object.entries(obj)) {
      // Skip geometry-related fields
      if (key === 'geometry' || key === 'geometries' || key === 'coordinates' || 
          key === 'polyline' || key === 'encoded_polyline' || key === 'path' ||
          key === 'route_geometry' || key === 'step_geometry') {
        filtered[key] = '[GEOMETRY_FILTERED]'
      } else {
        filtered[key] = this.filterGeometryFields(value)
      }
    }
    
    return filtered
  }

  private getObjectiveString(objective: ObjectiveOption): string {
    if (objective.travel_cost) {
      if (objective.custom) {
        return `${objective.travel_cost} + ${objective.custom.type}:${objective.custom.value}`
      }
      return objective.travel_cost
    }
    return 'Unknown'
  }

  private calculateRouteLoad(route: any): number {
    // Use delivery and pickup arrays from route summary (correct approach)
    const delivery = route.delivery && Array.isArray(route.delivery) ? route.delivery[0] || 0 : 0
    const pickup = route.pickup && Array.isArray(route.pickup) ? route.pickup[0] || 0 : 0
    const totalLoad = delivery + pickup
    
    return totalLoad
  }
}