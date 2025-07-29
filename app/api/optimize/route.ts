import { NextRequest, NextResponse } from 'next/server'
import { ROIRIntegration } from '@/lib/roir-integration'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { inputFile, solutionFile, params, apiKey } = body

    if (!inputFile || !solutionFile || !params || !apiKey) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const roir = new ROIRIntegration(apiKey)
          const parsedParams = params

          // Send initial status
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', message: 'Starting optimization...' })}\n\n`))

          // Run optimization with real-time updates
          const { results, finalRequestId } = await roir.runOptimizationWithUpdates(
            inputFile,
            solutionFile,
            parsedParams,
            (iteration, result) => {
              // Send each iteration result as it completes
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'iteration', iteration, result })}\n\n`))
            }
          )

          // Send completion status
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', results, finalRequestId })}\n\n`))
          controller.close()
        } catch (error) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('API route error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}