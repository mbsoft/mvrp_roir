export interface FileData {
  name: string
  content: string
  size: number
}

export interface FileSummary {
  jobs: number
  vehicles: number
  options: string[]
  hasTimeWindows: boolean
  hasCapacity: boolean
  hasServiceTime: boolean
}

export interface SolutionSummary {
  routes: number
  unassigned: number
  averageRouteDuration: number
  averageRouteDistance: number
  totalDistance: number
  totalDuration: number
  hasUnassignedJobs: boolean
  routeDetails: RouteDetail[]
  routesBelowLoadTarget?: number
  loadTarget?: number
}

export interface RouteDetail {
  routeId: string
  stops: number
  distance: number
  duration: number
  load: number
}

export interface ObjectiveOption {
  travel_cost?: 'duration' | 'distance' | 'air_distance' | 'customized'
  custom?: {
    type: 'min' | 'min-max'
    value: 'vehicles' | 'completion_time' | 'travel_cost' | 'tasks'
  }
}

export interface OptimizationParams {
  timeWindowEasing: number
  shiftTimeAdjustments: number
  numberOfIterations: number
  loadTargets: number
  objective?: ObjectiveOption
}

export interface OptimizationResult {
  iteration: number
  compliance: number
  routes: number
  loadGap: number
  objective: string
  timeWindowEasing: number
  shiftTimeAdjustments: number
  type: 'Success' | 'Error'
  requestId: string
  timestamp: string
}

export interface ApiResponse {
  results: OptimizationResult[]
  finalRequestId: string
  success: boolean
  message?: string
}