# ROIR Next.js Web Application

A modern web interface for the Route Optimization Iterative Refiner (ROIR) built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **File Upload Interface**: Drag and drop or copy/paste input.json and solution.json files
- **Input Modifiers Panel**: Adjust optimization parameters with intuitive sliders
- **Execution Control**: Run ROIR optimization with real-time status updates
- **Results Table**: View detailed optimization results with compliance tracking
- **Request ID Tracking**: Get the final request ID for tracking optimization runs
- **Export Functionality**: Download results as JSON files

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- NextBillion.ai API credentials

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp env.example .env.local
```

Edit `.env.local` and add your NextBillion.ai API credentials:
```
NEXTBILLION_API_KEY=your_api_key_here
NEXTBILLION_API_URL=https://api.nextbillion.io
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### 1. Upload Files
- Drag and drop your `input.json` and `solution.json` files into the designated areas
- Or click to browse and select files
- Files are validated for proper JSON format and required fields

### 2. Configure Parameters
Use the Input Modifiers panel to adjust:
- **Time Window Easing**: Allow time windows to be exceeded (0-120 minutes)
- **Shift Time Adjustments**: Adjust shift start/end times (0-60 minutes)
- **Number of Iterations**: Maximum optimization iterations (1-20)
- **Load Targets**: Minimum load per route (5,000-20,000 units)

### 3. Run Optimization
- Click "Run ROIR" to start the optimization process
- Monitor progress with real-time status updates
- The process will continue until 100% compliance is achieved or max iterations reached

### 4. View Results
- Results are displayed in a comprehensive table showing:
  - Iteration number and compliance percentage
  - Number of routes and load gaps
  - Optimization objectives and vehicle configurations
  - Time window settings and strategy types
- Copy the final request ID for tracking
- Export results as JSON for further analysis

## Project Structure

```
├── app/                    # Next.js 13+ app directory
│   ├── api/               # API routes
│   │   └── optimize/      # Optimization endpoint
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── FileUpload.tsx     # File upload with drag/drop
│   ├── InputModifiers.tsx # Parameter adjustment panel
│   ├── ExecutionPanel.tsx # Run button and status
│   └── ResultsTable.tsx   # Results display table
├── lib/                   # Utility libraries
│   └── roir-integration.ts # ROIR logic integration
├── types/                 # TypeScript type definitions
│   └── index.ts
├── src/                   # Original ROIR logic (preserved)
└── public/                # Static assets
```

## API Integration

The web app integrates with the existing ROIR logic through:

1. **File Validation**: Validates uploaded JSON files for required fields
2. **Parameter Processing**: Converts UI parameters to ROIR-compatible format
3. **Optimization Execution**: Runs the iterative optimization process
4. **Result Formatting**: Formats ROIR results for web display

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run roir` - Run original ROIR CLI (preserved)

### Adding Features

1. **New Parameters**: Add to `OptimizationParams` interface and `InputModifiers` component
2. **Additional Results**: Extend `OptimizationResult` interface and `ResultsTable` component
3. **API Endpoints**: Create new routes in `app/api/`
4. **Styling**: Use Tailwind CSS classes and extend theme in `tailwind.config.js`

## Deployment

### Vercel (Recommended)
1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy automatically

### Other Platforms
1. Build the application: `npm run build`
2. Start production server: `npm run start`
3. Configure environment variables
4. Set up reverse proxy if needed

## Troubleshooting

### Common Issues

1. **File Upload Fails**
   - Check file format (must be valid JSON)
   - Verify required fields in input.json and solution.json
   - Check browser console for validation errors

2. **Optimization Fails**
   - Verify NextBillion.ai API credentials
   - Check API rate limits
   - Review server logs for detailed error messages

3. **Build Errors**
   - Ensure all TypeScript types are properly defined
   - Check for missing dependencies
   - Verify Next.js configuration

### Environment Variables

Required environment variables:
- `NEXTBILLION_API_KEY`: Your NextBillion.ai API key
- `NEXTBILLION_API_URL`: NextBillion.ai API URL (optional, defaults to production)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License - see the original LICENSE file for details.