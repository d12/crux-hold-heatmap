# Climbing Hold Heatmap

A web application for visualizing climbing hold usage patterns. This tool allows you to view climbing walls from your Crux gyms and see which holds are used most frequently in climbs.

## Features

- View climbing walls from your Crux gyms
- Interactive heatmap visualization of hold usage
- Hold selection with detailed usage information
- Links to climbs using specific holds
- Progress tracking for loading large datasets
- Automatic retry and rate limit handling

## Getting Started

1. Get your Crux API key:
   - Open the Crux app
   - Go to Profile -> Settings -> API Authentication
   - Copy the API key

2. Open the application in your web browser
   - Enter your API key
   - Select a gym from your viewed gyms
   - Choose a wall to analyze

## Usage

1. **Selecting a Wall**
   - After selecting a gym, you'll see a grid of wall images
   - Each card shows the number of climbs and date range
   - Click on a wall to load its heatmap

2. **Viewing the Heatmap**
   - Blue areas indicate less frequently used holds
   - Red areas indicate more frequently used holds
   - Hover over holds to highlight them
   - Click on a hold to see detailed usage information

3. **Hold Information**
   - When you click a hold, you'll see:
     - Number of climbs using the hold
     - List of climbs with links to Crux
     - Links open in a new tab

## Color Coding

- Blue: Less frequently used holds
- Red: More frequently used holds
- Intensity indicates relative usage

## Privacy

Your API key is stored only in your browser's memory and is never sent to any server other than the Crux API. The application runs entirely in your browser.

## Development

This is a simple prototype built with vanilla HTML, CSS, and JavaScript. No build process or dependencies are required.

## Deployment

The application can be deployed to GitHub Pages by:

1. Creating a new repository
2. Pushing these files to the repository
3. Enabling GitHub Pages in the repository settings

## License

MIT License
