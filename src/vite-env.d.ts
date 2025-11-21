// This file provides type definitions for Vite's client-side environment,
// and it's a great place to add custom type declarations for your project.

/// <reference types="vite/client" />

// This declaration tells TypeScript that importing a .png file will yield a string (the URL).
declare module '*.png';
declare module '*.hdr';
declare module '*.hdr?url';
