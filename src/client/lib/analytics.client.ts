export interface TrackerConfig {
  url: string;
  websiteId: string;
}

export type EventData = Record<string, string | number | boolean>;

/** The subset of Umami's tracker API this app uses (https://umami.is/docs/tracker-functions). */
interface UmamiTracker {
  track(): void;
  track(name: string, data?: EventData): void;
  identify(id: string, data?: EventData): void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export const TRACKER_SCRIPT_ID = "umami-tracker";

let currentUserId: string | null = null;

/**
 * Thin wrapper over Umami's tracker script. Everything is a no-op until `init` has run and the
 * script has loaded; the only state kept is the current user id, replayed on load.
 */
export const analytics = {
  init(config: TrackerConfig): void {
    if (document.getElementById(TRACKER_SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = TRACKER_SCRIPT_ID;
    script.defer = true;
    script.src = `${config.url}/script.js`;
    script.dataset.websiteId = config.websiteId;
    // The router reports navigations itself; the tracker's own history hooks stay off.
    script.dataset.autoTrack = "false";
    script.dataset.doNotTrack = "true";
    script.addEventListener("load", () => {
      analytics.identify(currentUserId);
      analytics.page();
    });
    document.head.append(script);
  },

  page(): void {
    window.umami?.track();
  },

  track(name: string, data?: EventData): void {
    window.umami?.track(name, data);
  },

  identify(userId: string | null): void {
    currentUserId = userId;
    if (userId) window.umami?.identify(userId);
  },
};
