'use client'

import { useCallback, useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X, Info, Route, AlertTriangle } from 'lucide-react'
import { FileData, FileSummary, SolutionSummary } from '@/types'

interface FileUploadProps {
  title: string
  onFileUpload: (file: FileData | null) => void
  acceptedFileType: string
  loadTarget?: number
  onLoadTargetSuggestion?: (min: number, max: number, suggested: number) => void
}

export default function FileUpload({ title, onFileUpload, acceptedFileType, loadTarget, onLoadTargetSuggestion }: FileUploadProps) {
  const [fileSummary, setFileSummary] = useState<FileSummary | null>(null)
  const [solutionSummary, setSolutionSummary] = useState<SolutionSummary | null>(null)
  const [currentFileContent, setCurrentFileContent] = useState<string | null>(null)
  const [hasSuggestedLoadTarget, setHasSuggestedLoadTarget] = useState(false)

  const parseFileSummary = (content: string): FileSummary | null => {
    try {
      const data = JSON.parse(content)
      
      // Extract basic counts
      const jobs = data.jobs?.length || 0
      const vehicles = data.vehicles?.length || 0
      
      // Check for various options/features
      const options: string[] = []
      const hasTimeWindows = jobs > 0 && data.jobs.some((job: any) => job.time_windows)
      const hasCapacity = vehicles > 0 && data.vehicles.some((vehicle: any) => vehicle.capacity)
      const hasServiceTime = jobs > 0 && data.jobs.some((job: any) => job.service_time)
      
      if (hasTimeWindows) options.push('Time Windows')
      if (hasCapacity) options.push('Vehicle Capacity')
      if (hasServiceTime) options.push('Service Time')
      if (data.depots) options.push('Depots')
      if (data.options?.objective) {
        const objective = data.options.objective
        if (typeof objective === 'object' && objective.custom) {
          options.push(`Objective: ${objective.custom.type} ${objective.custom.value}`)
        } else if (typeof objective === 'string') {
          options.push(`Objective: ${objective}`)
        }
      }
      if (data.options?.constraints) options.push('Constraints')
      
      return {
        jobs,
        vehicles,
        options,
        hasTimeWindows,
        hasCapacity,
        hasServiceTime
      }
    } catch (error) {
      console.error('Error parsing file summary:', error)
      return null
    }
  }

  const parseSolutionSummary = (content: string, loadTarget?: number): SolutionSummary | null => {
    try {
      const data = JSON.parse(content)
      
      // Handle nested structure
      const result = data.result || data
      const routes = result.routes?.length || 0
      const unassigned = result.unassigned?.length || 0
      const summary = result.summary || {}
      
      let totalDistance = summary.distance || 0
      let totalDuration = summary.duration || 0
      const routeDetails: any[] = []
      let routesBelowLoadTarget = 0
      
      // Collect delivery values for load target analysis
      const deliveryValues: number[] = []
      
      if (routes > 0 && result.routes) {
        result.routes.forEach((route: any, index: number) => {
          const distance = route.distance || 0
          const duration = route.duration || 0
          const stops = route.steps?.length || 0
          const load = route.load || 0
          
          // Extract delivery value from route
          if (route.delivery && Array.isArray(route.delivery) && route.delivery[0]) {
            deliveryValues.push(route.delivery[0])
          }
          
          // Count routes below load target if loadTarget is provided
          if (loadTarget && load < loadTarget) {
            routesBelowLoadTarget++
          }
          
          routeDetails.push({
            routeId: route.vehicle || `Route ${index + 1}`,
            stops,
            distance,
            duration,
            load
          })
        })
      }
      
      // Analyze delivery values and suggest load target range
      if (deliveryValues.length > 0) {
        analyzeDeliveryValuesAndSuggestLoadTarget(deliveryValues)
      }
      
      const averageRouteDistance = routes > 0 ? totalDistance / routes : 0
      const averageRouteDuration = routes > 0 ? totalDuration / routes : 0
      
      return {
        routes,
        unassigned,
        averageRouteDistance: Math.round(averageRouteDistance * 100) / 100,
        averageRouteDuration: Math.round(averageRouteDuration * 100) / 100,
        totalDistance: Math.round(totalDistance * 100) / 100,
        totalDuration: Math.round(totalDuration * 100) / 100,
        hasUnassignedJobs: unassigned > 0,
        routeDetails,
        routesBelowLoadTarget: loadTarget ? routesBelowLoadTarget : undefined,
        loadTarget
      }
    } catch (error) {
      console.error('Error parsing solution summary:', error)
      return null
    }
  }

  // Function to analyze delivery values and suggest load target range
  const analyzeDeliveryValuesAndSuggestLoadTarget = (deliveryValues: number[]) => {
    if (deliveryValues.length === 0) return

    // Only suggest once per file upload
    if (hasSuggestedLoadTarget) return

    const maxDelivery = Math.max(...deliveryValues)
    const minDelivery = Math.min(...deliveryValues)
    const avgDelivery = deliveryValues.reduce((sum, val) => sum + val, 0) / deliveryValues.length
    const medianDelivery = deliveryValues.sort((a, b) => a - b)[Math.floor(deliveryValues.length / 2)]

    let suggestedMin: number
    let suggestedMax: number
    let suggestedTarget: number

    // Analyze the range and suggest appropriate load target settings
    if (maxDelivery < 1000) {
      // Small delivery values (mostly < 1000)
      suggestedMin = 100
      suggestedMax = 1000
      suggestedTarget = Math.min(Math.max(avgDelivery * 0.8, 200), 800)
    } else if (maxDelivery < 5000) {
      // Medium delivery values (1000-5000)
      suggestedMin = 1000
      suggestedMax = 5000
      suggestedTarget = Math.min(Math.max(avgDelivery * 0.8, 1500), 4000)
    } else if (maxDelivery < 15000) {
      // Large delivery values (5000-15000)
      suggestedMin = 5000
      suggestedMax = 15000
      suggestedTarget = Math.min(Math.max(avgDelivery * 0.8, 8000), 12000)
    } else {
      // Very large delivery values (> 15000)
      suggestedMin = 10000
      suggestedMax = 20000
      suggestedTarget = Math.min(Math.max(avgDelivery * 0.8, 15000), 18000)
    }

    // Round to nearest 100 for cleaner values
    suggestedMin = Math.round(suggestedMin / 100) * 100
    suggestedMax = Math.round(suggestedMax / 100) * 100
    suggestedTarget = Math.round(suggestedTarget / 100) * 100

    // Call the callback to notify parent component
    if (onLoadTargetSuggestion) {
      onLoadTargetSuggestion(suggestedMin, suggestedMax, suggestedTarget)
      setHasSuggestedLoadTarget(true) // Mark that we've suggested for this file
    }

    console.log('Load Target Analysis:', {
      deliveryValues: { min: minDelivery, max: maxDelivery, avg: avgDelivery, median: medianDelivery },
      suggestedRange: { min: suggestedMin, max: suggestedMax, target: suggestedTarget }
    })
  }

  // Helper function to format duration from seconds to HH:MM
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours.toString().padStart(2, '0')}HR ${minutes.toString().padStart(2, '0')}MN`
  }

  // Helper function to convert meters to kilometers
  const formatDistance = (meters: number): string => {
    const kilometers = meters / 1000
    return `${kilometers.toFixed(2)} km`
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        setCurrentFileContent(content)
        setHasSuggestedLoadTarget(false) // Reset flag for new file
        const fileData = {
          name: file.name,
          content,
          size: file.size,
        }
        
        // Parse and set file summary based on file type
        if (title.toLowerCase().includes('solution')) {
          const summary = parseSolutionSummary(content, loadTarget)
          setSolutionSummary(summary)
          setFileSummary(null)
        } else {
          const summary = parseFileSummary(content)
          setFileSummary(summary)
          setSolutionSummary(null)
        }
        
        onFileUpload(fileData)
      }
      reader.readAsText(file)
    }
  }, [onFileUpload, title, loadTarget])

  useEffect(() => {
    if (currentFileContent && title.toLowerCase().includes('solution')) {
      const summary = parseSolutionSummary(currentFileContent, loadTarget);
      setSolutionSummary(summary);
    }
  }, [currentFileContent, loadTarget, title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
    },
    multiple: false,
  })

  const handleRemove = () => {
    onFileUpload(null)
    setFileSummary(null)
    setSolutionSummary(null)
    setCurrentFileContent(null)
    setHasSuggestedLoadTarget(false) // Reset flag when file is removed
  }

  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-4">
        {title.includes('Input') ? (
          <FileText className="h-5 w-5 text-gray-600" />
        ) : (
          <Route className="h-5 w-5 text-gray-600" />
        )}
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center space-y-2">
          {isDragActive ? (
            <>
              <Upload className="h-8 w-8 text-primary-500" />
              <p className="text-primary-600 font-medium">Drop the file here</p>
            </>
          ) : (
            <>
              <FileText className="h-8 w-8 text-gray-400" />
              <p className="text-gray-600">
                Drag and drop a {acceptedFileType} file here, or click to select
              </p>
              <p className="text-sm text-gray-500">
                Supports {acceptedFileType} files only
              </p>
            </>
          )}
        </div>
      </div>

      {fileSummary && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-2 mb-3">
            <Info className="h-4 w-4 text-blue-600" />
            <h4 className="text-sm font-medium text-blue-900">File Summary</h4>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-blue-800">Jobs/Shipments:</span>
              <span className="ml-2 text-blue-700">{fileSummary.jobs.toLocaleString()}</span>
            </div>
            <div>
              <span className="font-medium text-blue-800">Vehicles:</span>
              <span className="ml-2 text-blue-700">{fileSummary.vehicles.toLocaleString()}</span>
            </div>
          </div>
          
          {fileSummary.options.length > 0 && (
            <div className="mt-3">
              <span className="font-medium text-blue-800 text-sm">Features:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {fileSummary.options.map((option, index) => (
                  <span
                    key={index}
                    className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full"
                  >
                    {option}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {solutionSummary && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-2 mb-3">
            <Route className="h-4 w-4 text-green-600" />
            <h4 className="text-sm font-medium text-green-900">Solution Analysis</h4>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-green-800">Routes:</span>
              <span className="ml-2 text-green-700">{solutionSummary.routes.toLocaleString()}</span>
            </div>
            <div>
              <span className="font-medium text-green-800">Unassigned:</span>
              <span className="ml-2 text-green-700">{solutionSummary.unassigned.toLocaleString()}</span>
            </div>
            <div>
              <span className="font-medium text-green-800">Avg Duration:</span>
              <span className="ml-2 text-green-700">{formatDuration(solutionSummary.averageRouteDuration)}</span>
            </div>
            <div>
              <span className="font-medium text-green-800">Avg Distance:</span>
              <span className="ml-2 text-green-700">{formatDistance(solutionSummary.averageRouteDistance)}</span>
            </div>
          </div>
          
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-green-800">Total Distance:</span>
              <span className="ml-2 text-green-700">{formatDistance(solutionSummary.totalDistance)}</span>
            </div>
            <div>
              <span className="font-medium text-green-800">Total Duration:</span>
              <span className="ml-2 text-green-700">{formatDuration(solutionSummary.totalDuration)}</span>
            </div>
          </div>

          {solutionSummary.loadTarget && solutionSummary.routesBelowLoadTarget !== undefined && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-orange-600 font-medium text-sm">Load Target Analysis</span>
              </div>
              <div className="text-sm">
                <span className="font-medium text-orange-800">Load Target:</span>
                <span className="ml-2 text-orange-700">{solutionSummary.loadTarget.toLocaleString()} kg</span>
              </div>
              <div className="text-sm mt-1">
                <span className="font-medium text-orange-800">Routes Below Target:</span>
                <span className="ml-2 text-orange-700">
                  {solutionSummary.routes > 0 ? Math.round((solutionSummary.routesBelowLoadTarget / solutionSummary.routes) * 100) : 0}%
                </span>
              </div>
              
              {solutionSummary.hasUnassignedJobs && (
                <div className="mt-3 p-2 bg-orange-100 border border-orange-300 rounded flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                  <span className="text-sm text-orange-800">
                    ⚠️ {solutionSummary.unassigned} jobs could not be assigned to routes
                  </span>
                </div>
              )}
            </div>
          )}

          {solutionSummary.hasUnassignedJobs && !solutionSummary.loadTarget && (
            <div className="mt-3 p-2 bg-yellow-100 border border-yellow-200 rounded text-xs text-yellow-800">
              ⚠️ {solutionSummary.unassigned} jobs could not be assigned to routes
            </div>
          )}
        </div>
      )}
    </div>
  )
}