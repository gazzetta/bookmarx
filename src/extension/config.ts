// Development builds use localhost. npm run build:release sets production URLs
// and matching manifest host permissions at build time; no source editing is required.
declare const __BOOKMARX_API_BASE_URL__: string;
declare const __BOOKMARX_WEBSITE_BASE_URL__: string;
declare const __BOOKMARX_GOOGLE_CLIENT_ID__: string;
export const API_BASE_URL = typeof __BOOKMARX_API_BASE_URL__ === 'undefined' ? 'http://localhost:3005' : __BOOKMARX_API_BASE_URL__;
export const WEBSITE_BASE_URL = typeof __BOOKMARX_WEBSITE_BASE_URL__ === 'undefined' ? API_BASE_URL : __BOOKMARX_WEBSITE_BASE_URL__;
export const GOOGLE_CLIENT_ID = (typeof __BOOKMARX_GOOGLE_CLIENT_ID__ === 'undefined' ? '' : __BOOKMARX_GOOGLE_CLIENT_ID__) || '669480413219-sv4vq2de70at057ra24jis15bftota8g.apps.googleusercontent.com';

