/*
 * frontend/src/main.jsx
 * -----------------------------------------------------------------------------
 * Application Entry Point
 * -----------------------------------------------------------------------------
 * This file bootstraps the React application and mounts it to the DOM.
 * It is responsible for setting up the global providers that wrap the entire app.
 *
 * Key Responsibilities:
 * 1.  **React Root**: Creates the React root and renders the `<App />` component.
 * 2.  **Mantine Provider**: Configures the Mantine UI framework with a custom theme
 *     and forces the dark color scheme.
 * 3.  **Global Styles**: Imports necessary CSS files for Mantine core and carousel components.
 * 4.  **Strict Mode**: Wraps the app in `React.StrictMode` for development checks.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { MantineProvider, createTheme, ColorSchemeScript } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/carousel/styles.css';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
});

// Render the full SPA. We wrap the app with MantineProvider so components
// can use the theme and consistent styling across the UI. The ColorScheme
// script ensures the browser loads the dark color scheme immediately.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ColorSchemeScript forceColorScheme="dark" />
    <MantineProvider theme={theme} forceColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>,
)