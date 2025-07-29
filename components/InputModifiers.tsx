'use client'

import { Settings } from 'lucide-react'
import { OptimizationParams } from '@/types'

interface InputModifiersProps {
  params: OptimizationParams
  onParamsChange: (params: OptimizationParams) => void
  loadTargetRange?: { min: number; max: number }
}

export default function InputModifiers({ params, onParamsChange, loadTargetRange }: InputModifiersProps) {
  const handleChange = (key: keyof OptimizationParams, value: number) => {
    onParamsChange({
      ...params,
      [key]: value,
    })
  }

  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-4">
        <Settings className="h-5 w-5 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900">Input Modifiers</h3>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Time Window Easing (minutes)
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="0"
              max="120"
              step="5"
              value={params.timeWindowEasing}
              onChange={(e) => handleChange('timeWindowEasing', parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              aria-label="Time Window Easing slider"
            />
            <span className="text-sm font-medium text-gray-900 w-12">
              {params.timeWindowEasing}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Allows time windows to be exceeded by this amount
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Shift Time Adjustments (minutes)
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="0"
              max="180"
              step="5"
              value={params.shiftTimeAdjustments}
              onChange={(e) => handleChange('shiftTimeAdjustments', parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              aria-label="Shift Time Adjustments slider"
            />
            <span className="text-sm font-medium text-gray-900 w-12">
              {params.shiftTimeAdjustments}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Adjusts shift start/end times for better route optimization
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Iterations
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={params.numberOfIterations}
              onChange={(e) => handleChange('numberOfIterations', parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              aria-label="Number of Iterations slider"
            />
            <span className="text-sm font-medium text-gray-900 w-12">
              {params.numberOfIterations}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Maximum number of optimization iterations to run
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Load Targets (units)
            {loadTargetRange && (
              <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Auto-adjusted
              </span>
            )}
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min={loadTargetRange?.min || 5000}
              max={loadTargetRange?.max || 20000}
              step={loadTargetRange ? Math.max(50, Math.floor((loadTargetRange.max - loadTargetRange.min) / 50)) : 1000}
              value={Math.max(loadTargetRange?.min || 5000, Math.min(loadTargetRange?.max || 20000, params.loadTargets))}
              onChange={(e) => handleChange('loadTargets', parseInt(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              aria-label="Load Targets slider"
            />
            <span className="text-sm font-medium text-gray-900 w-16">
              {params.loadTargets.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {loadTargetRange 
              ? `Auto-adjusted range based on solution analysis. Range: ${loadTargetRange.min.toLocaleString()} - ${loadTargetRange.max.toLocaleString()} units`
              : 'Minimum load target for each route'
            }
          </p>
        </div>
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Current Settings</h4>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
          <div>Time Window Easing: {params.timeWindowEasing}m</div>
          <div>Shift Adjustments: {params.shiftTimeAdjustments}m</div>
          <div>Iterations: {params.numberOfIterations}</div>
          <div>Load Target: {params.loadTargets.toLocaleString()} units</div>
          {loadTargetRange && (
            <div className="col-span-2 text-blue-600">
              Load Range: {loadTargetRange.min.toLocaleString()} - {loadTargetRange.max.toLocaleString()} units
            </div>
          )}
        </div>
      </div>
    </div>
  )
}