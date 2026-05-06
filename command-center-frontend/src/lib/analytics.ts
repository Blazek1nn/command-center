/**
 * analytics.ts — Frontend analytics wrapper (PostHog-optional).
 *
 * Zero hard dependencies:
 *   - Without NEXT_PUBLIC_POSTHOG_KEY: logs events to console in dev, no-ops in prod.
 *   - With NEXT_PUBLIC_POSTHOG_KEY: dynamically imports posthog-js and forwards events.
 *
 * Usage:
 *   import { analytics } from "@/lib/analytics"
 *   analytics.track("plan_approved", { n_tasks: 3, project: "my-app" })
 *
 * Standard events (keep consistent for funnel analysis):
 *   page_view               — automatic via PostHogPageView component
 *   plan_approved           — { n_tasks, project, was_edited }
 *   plan_rejected           — { project }
 *   task_succeeded          — { project, model, cost_usd, duration_s }
 *   task_failed             — { project, model, permission_blocked }
 *   conversation_started    — { project }
 *   shortcut_used           — { shortcut }
 *   model_changed           — { from, to }
 *   mcp_blocked_shown       — { project }
 */

type Properties = Record<string, string | number | boolean | null | undefined>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PostHogInstance = any;

class Analytics {
  private _ph: PostHogInstance = null;
  private _ready = false;
  private _queue: Array<{ event: string; props: Properties }> = [];

  constructor() {
    if (typeof window === "undefined") return; // SSR guard
    void this._init();
  }

  private async _init(): Promise<void> {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ?? "https://app.posthog.com";

    if (!key) {
      this._ready = true;
      this._flush();
      return;
    }

    try {
      // posthog-js is an optional peer dep — install it to enable PostHog.
      // Dynamic import so the app compiles and runs without it.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — module may not be installed
      const { default: posthog } = await import("posthog-js");
      posthog.init(key, {
        api_host: host,
        capture_pageview: false, // we do this manually via PostHogPageView
        persistence: "localStorage+cookie",
        autocapture: false, // opt-in only — we control what we track
      });
      this._ph = posthog;
      this._ready = true;
      this._flush();
    } catch {
      // posthog-js not installed — degrade gracefully
      this._ready = true;
      this._flush();
    }
  }

  private _flush(): void {
    for (const { event, props } of this._queue) {
      this._send(event, props);
    }
    this._queue = [];
  }

  private _send(event: string, props: Properties): void {
    if (this._ph) {
      this._ph.capture(event, props);
    } else if (process.env.NODE_ENV === "development") {
      console.debug("[analytics]", event, props);
    }
  }

  public track(event: string, properties?: Properties): void {
    const props = properties ?? {};
    if (!this._ready) {
      this._queue.push({ event, props });
      return;
    }
    this._send(event, props);
  }

  public identify(distinctId: string, traits?: Properties): void {
    if (this._ph) {
      this._ph.identify(distinctId, traits);
    }
  }

  public page(path?: string): void {
    this.track("page_view", { path: path ?? (typeof window !== "undefined" ? window.location.pathname : "") });
  }

  public reset(): void {
    if (this._ph) this._ph.reset();
  }
}

// Singleton — import and use directly anywhere in the app
export const analytics = new Analytics();
