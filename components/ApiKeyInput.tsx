'use client'

import { useState, useEffect } from 'react'
import { Key, Eye, EyeOff, Save } from 'lucide-react'

interface ApiKeyInputProps {
  onApiKeyChange?: (apiKey: string) => void
}

export default function ApiKeyInput({ onApiKeyChange }: ApiKeyInputProps) {
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  // Load API key from localStorage on component mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('nextbillion_api_key')
    if (savedApiKey) {
      setApiKey(savedApiKey)
      setIsSaved(true)
      onApiKeyChange?.(savedApiKey)
    }
  }, [onApiKeyChange])

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem('nextbillion_api_key', apiKey.trim())
      setIsSaved(true)
      onApiKeyChange?.(apiKey.trim())
      
      // Show temporary success feedback
      setTimeout(() => setIsSaved(false), 2000)
    }
  }

  const handleClear = () => {
    localStorage.removeItem('nextbillion_api_key')
    setApiKey('')
    setIsSaved(false)
    onApiKeyChange?.('')
  }

  return (
    <div className="card">
      <div className="flex items-center space-x-2 mb-4">
        <Key className="h-5 w-5 text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900">API Configuration</h3>
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            NextBillion.ai API Key
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your NextBillion.ai API key"
              className="input-field pr-20"
            />
            <div className="absolute inset-y-0 right-0 flex items-center space-x-1 pr-3">
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Your API key is stored locally in your browser and will be remembered when you return.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleSave}
            disabled={!apiKey.trim()}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              apiKey.trim()
                ? 'bg-primary-600 hover:bg-primary-700 text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Save className="h-4 w-4" />
            <span>{isSaved ? 'Saved!' : 'Save API Key'}</span>
          </button>
          
          {isSaved && (
            <button
              onClick={handleClear}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {isSaved && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              ✓ API key saved successfully. It will be used for optimization requests.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}