'use client'

import React from 'react'
import { Play, Loader2 } from 'lucide-react'

interface ExecutionPanelProps {
  isExecuting: boolean
  executionStatus: string
  onExecute: () => void
  canExecute: boolean
  currentIteration?: number
  totalIterations?: number
}

export default function ExecutionPanel({ 
  isExecuting, 
  executionStatus, 
  onExecute, 
  canExecute,
  currentIteration = 0,
  totalIterations = 0
}: ExecutionPanelProps) {
  const progress = totalIterations > 0 ? (currentIteration / totalIterations) * 100 : 0

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Execution</h3>
      
      <button
        onClick={onExecute}
        disabled={!canExecute || isExecuting}
        className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors ${
          canExecute && !isExecuting
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {isExecuting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Running ROIR...</span>
          </>
        ) : (
          <>
            <Play className="h-5 w-5" />
            <span>Run ROIR</span>
          </>
        )}
      </button>

      {isExecuting && totalIterations > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Progress</span>
            <span>{currentIteration} / {totalIterations} iterations</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {executionStatus && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700">{executionStatus}</p>
        </div>
      )}
    </div>
  )
}