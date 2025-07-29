'use client'

import { useState } from 'react'
import FileUpload from '@/components/FileUpload'
import InputModifiers from '@/components/InputModifiers'
import ExecutionPanel from '@/components/ExecutionPanel'
import ResultsTable from '@/components/ResultsTable'
import ApiKeyInput from '@/components/ApiKeyInput'
import { FileData, OptimizationParams, OptimizationResult } from '@/types'

export default function Home() {
  const [inputFile, setInputFile] = useState<FileData | null>(null)
  const [solutionFile, setSolutionFile] = useState<FileData | null>(null)
  const [optimizationParams, setOptimizationParams] = useState<OptimizationParams>({
    timeWindowEasing: 30,
    shiftTimeAdjustments: 15,
    numberOfIterations: 10,
    loadTargets: 12000,
  })
  const [results, setResults] = useState<OptimizationResult[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionStatus, setExecutionStatus] = useState('')
  const [currentIteration, setCurrentIteration] = useState(0)
  const [finalRequestId, setFinalRequestId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loadTargetRange, setLoadTargetRange] = useState<{ min: number; max: number } | undefined>()

  const handleLoadTargetSuggestion = (min: number, max: number, suggested: number) => {
    setOptimizationParams(prev => ({
      ...prev,
      loadTargets: suggested
    }))
    
    // Store the range for the slider
    setLoadTargetRange({ min, max })
    
    // Show a notification or update status to inform user
    setExecutionStatus(`Auto-adjusted load target to ${suggested} based on solution analysis`)
  }

  const handleExecute = async () => {
    if (!inputFile || !solutionFile || !apiKey) return

    setIsExecuting(true)
    setResults([])
    setCurrentIteration(0)
    setFinalRequestId('')
    setExecutionStatus('Starting optimization...')

    try {
      // Use POST instead of GET to avoid URL length limitations
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputFile: inputFile.content,
          solutionFile: solutionFile.content,
          params: optimizationParams,
          apiKey,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              switch (data.type) {
                case 'status':
                  setExecutionStatus(data.message)
                  break

                case 'iteration':
                  setResults(prev => [...prev, data.result])
                  setCurrentIteration(data.iteration)
                  setExecutionStatus(`Completed iteration ${data.iteration} of ${optimizationParams.numberOfIterations}`)
                  break

                case 'complete':
                  setFinalRequestId(data.finalRequestId)
                  setExecutionStatus('Optimization completed successfully!')
                  return

                case 'error':
                  setExecutionStatus(`Error: ${data.error}`)
                  setIsExecuting(false)
                  return
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError)
            }
          }
        }
      }
    } catch (error) {
      console.error('Execution error:', error)
      setExecutionStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Route Optimization Iterative Refiner (ROIR)
          </h1>
          <p className="text-gray-600">
            Upload your input and solution files to run the iterative refiner
          </p>
        </div>

        <div className="space-y-6">
          {/* API Configuration Panel */}
          <div className="w-full">
            <ApiKeyInput onApiKeyChange={setApiKey} />
          </div>

          {/* Top Row - File Uploads and Input Modifiers */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column - File Uploads and Execution */}
            <div className="lg:col-span-2 space-y-6">
              <FileUpload
                title="Input File (input.json)"
                onFileUpload={setInputFile}
                acceptedFileType=".json"
              />
              <FileUpload
                title="Solution File (solution.json)"
                onFileUpload={setSolutionFile}
                acceptedFileType=".json"
                loadTarget={optimizationParams.loadTargets}
                onLoadTargetSuggestion={handleLoadTargetSuggestion}
              />
              <ExecutionPanel
                isExecuting={isExecuting}
                executionStatus={executionStatus}
                onExecute={handleExecute}
                canExecute={!!(inputFile && solutionFile && apiKey)}
                currentIteration={currentIteration}
                totalIterations={optimizationParams.numberOfIterations}
              />
            </div>

            {/* Right Column - Input Modifiers */}
            <div className="lg:col-span-2 space-y-6">
              <InputModifiers
                params={optimizationParams}
                onParamsChange={setOptimizationParams}
                loadTargetRange={loadTargetRange}
              />
            </div>
          </div>

          {/* Bottom Row - Results Table (full width) */}
          <div className="w-full">
            <ResultsTable results={results} finalRequestId={finalRequestId} />
          </div>
        </div>
      </div>
    </div>
  )
}