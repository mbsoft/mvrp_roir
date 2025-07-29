'use client'

import React from 'react'
import { OptimizationResult } from '@/types'
import { Copy, Download } from 'lucide-react'

interface ResultsTableProps {
  results: OptimizationResult[]
  finalRequestId: string
}

export default function ResultsTable({ results, finalRequestId }: ResultsTableProps) {
  const handleCopyRequestId = () => {
    navigator.clipboard.writeText(finalRequestId)
  }

  const handleExportResults = () => {
    const csvContent = [
      ['Iteration', 'Compliance (%)', 'Routes', 'Load Gap', 'Objective', 'Time Window', 'Request ID', 'Timestamp'],
      ...results.map(result => [
        result.iteration.toString(),
        result.compliance.toString(),
        result.routes.toString(),
        result.loadGap.toString(),
        result.objective,
        result.timeWindow,
        result.requestId,
        result.timestamp
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `roir-results-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (results.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Optimization Results</h3>
        <div className="flex space-x-2">
          <button
            onClick={handleCopyRequestId}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
          >
            <Copy className="h-4 w-4" />
            <span>Copy Final Request ID</span>
          </button>
          <button
            onClick={handleExportResults}
            className="flex items-center space-x-1 px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Iteration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Compliance (%)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Routes
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Load Gap
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Objective
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time Window
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.map((result, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {result.iteration}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    result.compliance >= 80 
                      ? 'bg-green-100 text-green-800' 
                      : result.compliance >= 60 
                      ? 'bg-yellow-100 text-yellow-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {result.compliance}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {result.routes}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {result.loadGap.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {result.objective}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {result.timeWindow}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {results.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">
            <strong>Final Request ID:</strong> 
            <span className="ml-2 font-mono text-xs bg-gray-200 px-2 py-1 rounded">
              {finalRequestId}
            </span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {results.map((result, index) => (
              <div key={index} className="mb-1">
                <span className="font-medium">Iteration {result.iteration}:</span> {result.requestId}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}