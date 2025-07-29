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
}

export default function FileUpload({ title, onFileUpload, acceptedFileType, loadTarget }: FileUploadProps) {
  const [fileSummary, setFileSummary] = useState<FileSummary | null>(null)
  const [solutionSummary, setSolutionSummary] = useState<SolutionSummary | null>(null)
  const [currentFileContent, setCurrentFileContent] = useState<string | null>(null)

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
      
      if (routes > 0 && result.routes) {
        result.routes.forEach((route: any, index: number) => {
          const distance = route.distance || 0
          const duration = route.duration || 0
          const stops = route.steps?.length || 0
          const load = route.load || 0
          
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
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      
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
                  {solutionSummary.routesBelowLoadTarget} of {solutionSummary.routes} routes 
                  ({solutionSummary.routes > 0 ? Math.round((solutionSummary.routesBelowLoadTarget / solutionSummary.routes) * 100) : 0}%)
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