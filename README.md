# Route Optimization Iterative Refiner (ROIR) - Next.js Application

A modern Next.js web application for iteratively refining route optimization using NextBillion.ai's API. Users can upload input and solution files, adjust optimization parameters, and run iterative optimization processes with real-time results.

## Features

- **File Upload**: Drag & drop or copy/paste `input.json` and `solution.json` files
- **File Analysis**: Automatic analysis and summary of uploaded files
- **Parameter Adjustment**: Interactive sliders for optimization parameters
- **API Key Management**: Secure storage and management of NextBillion.ai API keys
- **Real-time Optimization**: Execute iterative optimization with live progress tracking
- **Results Display**: Comprehensive results table with export functionality
- **Production API Integration**: Real NextBillion.ai API calls with error handling and retry logic

## Getting Started

### Prerequisites

- Node.js 16.20.2 or higher
- npm or yarn
- NextBillion.ai API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mvrp_roir
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp env.example .env.local
```

Edit `.env.local` with your configuration:
```env
NEXTBILLION_API_URL=https://api.nextbillion.io
NEXTBILLION_RATE_LIMIT_MS=1000
NEXTBILLION_MAX_RETRIES=3
NEXTBILLION_RETRY_DELAY_MS=1000
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### 1. API Configuration
- Enter your NextBillion.ai API key in the API Configuration panel
- The API key is stored securely in your browser's local storage
- Click "Save API Key" to persist the key for future sessions

### 2. File Upload
- Upload your `input.json` file (contains vehicles, jobs, and constraints)
- Upload your `solution.json` file (contains current route solution)
- The application automatically analyzes and displays file summaries

### 3. Parameter Adjustment
- **Time Window Easing**: Adjust time window flexibility (0-60 minutes)
- **Shift Time Adjustments**: Modify shift time constraints (0-30 minutes)
- **Number of Iterations**: Set optimization iteration count (1-20)
- **Load Targets**: Define vehicle load targets (kg)

### 4. Optimization Execution
- Click "Run ROIR" to start the optimization process
- Monitor progress through the execution panel
- View real-time results in the results table

### 5. Results Analysis
- Review optimization results for each iteration
- Copy the final request ID for tracking
- Export results for further analysis

## API Integration

### Production API Calls

The application makes real API calls to NextBillion.ai's route optimization service:

- **Optimization Endpoint**: `POST /optimization/v2?key={api_key}`
- **Result Endpoint**: `GET /optimization/v2/result?id={request_id}&key={api_key}`
- **Rate Limiting**: Configurable minimum interval between calls
- **Retry Logic**: Exponential backoff with configurable retry attempts
- **Error Handling**: Comprehensive error handling and logging
- **Fallback Mode**: Mock mode when API is unavailable or invalid key

### Request Payload Structure

```json
{
  "vehicles": [...],
  "jobs": [...],
  "options": {
    "time_window_easing": 30,
    "shift_time_adjustments": 15,
    "load_targets": 12000,
    "iteration": 1
  }
}
```

### Response Structure

```json
{
  "request_id": "nb_1234567890_1_abc123def",
  "status": "success",
  "result": {
    "routes": [...],
    "unassigned": [...],
    "summary": {
      "distance": 1000000,
      "duration": 36000
    }
  }
}
```

### Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `NEXTBILLION_API_URL` | `https://api.nextbillion.io` | API base URL |
| `NEXTBILLION_RATE_LIMIT_MS` | `1000` | Minimum ms between API calls |
| `NEXTBILLION_MAX_RETRIES` | `3` | Maximum retry attempts |
| `NEXTBILLION_RETRY_DELAY_MS` | `1000` | Initial retry delay (exponential backoff) |
| `NEXTBILLION_API_KEY` | (none) | Default API key (optional) |

### Fallback Mock Mode

When the NextBillion.ai API is unavailable or an invalid API key is provided, the application automatically falls back to mock mode:

- **Automatic Detection**: Real API calls are attempted first
- **Graceful Degradation**: Falls back to mock responses if API fails
- **Realistic Data**: Mock responses match the actual API structure
- **Request IDs**: Mock mode generates realistic request IDs for testing
- **Logging**: Clear indication when mock mode is being used

This ensures the application remains functional for testing and development purposes even without a valid API key.

## Project Structure

```
mvrp_roir/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   └── optimize/      # Optimization endpoint
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── ApiKeyInput.tsx    # API key management
│   ├── ExecutionPanel.tsx # Optimization execution
│   ├── FileUpload.tsx     # File upload handling
│   ├── InputModifiers.tsx # Parameter adjustment
│   └── ResultsTable.tsx   # Results display
├── lib/                   # Utility libraries
│   └── roir-integration.ts # API integration logic
├── types/                 # TypeScript type definitions
│   └── index.ts           # Shared types
├── env.example            # Environment configuration example
├── next.config.js         # Next.js configuration
├── package.json           # Dependencies and scripts
├── tailwind.config.js     # Tailwind CSS configuration
└── tsconfig.json          # TypeScript configuration
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Key Technologies

- **Next.js 13.5.6** - React framework with App Router
- **React 18.2.0** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **React Dropzone** - File upload handling

## Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Other Platforms

1. Build the application: `npm run build`
2. Start the production server: `npm run start`
3. Set environment variables for your platform

## Troubleshooting

### Common Issues

1. **API Key Errors**: Ensure your NextBillion.ai API key is valid and has sufficient credits
2. **Rate Limiting**: The application includes built-in rate limiting; increase `NEXTBILLION_RATE_LIMIT_MS` if needed
3. **File Format Errors**: Ensure your JSON files match the expected format
4. **Network Issues**: Check your internet connection and API endpoint accessibility

### Debug Mode

Enable debug logging by setting environment variables:
```env
DEBUG=true
NEXTBILLION_DEBUG=true
```

### Logs

The application logs all API calls and optimization progress to the console:
- API request URLs and timestamps
- Iteration progress and request IDs
- Error messages and retry attempts
- Optimization completion summaries

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 