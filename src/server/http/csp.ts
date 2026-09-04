import type { AnalyticsConfig } from "#core";

/**
 * CSP for the SPA and API. Only the analytics origin is added on top of `'self'`; the docs page
 * (Scalar from a CDN) is exempt in `app.ts`.
 */
export function buildContentSecurityPolicy(analytics: AnalyticsConfig) {
  const analyticsOrigin = analytics.enabled ? [new URL(analytics.url).origin] : [];
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", ...analyticsOrigin],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
    fontSrc: ["'self'", "data:"],
    connectSrc: ["'self'", "ws:", "wss:", ...analyticsOrigin],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
  };
}
