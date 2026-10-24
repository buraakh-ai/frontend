import { callApi } from "@/lib/backend-result";
import { createStore } from "@/lib/store";

/** One GET /zoho/campaigns item (Zoho's own field names; more keys exist). */
export type Campaign = {
  campaign_key: string;
  campaign_name: string;
  campaign_status: string;
  created_date_string?: string;
  sent_date_string?: string;
};

export const RECENT_CAMPAIGNS = 50;

/** GET /zoho/campaigns `status` values (Zoho's), with their labels. */
export const CAMPAIGN_STATUSES = {
  all: "All statuses",
  drafts: "Drafts",
  scheduled: "Scheduled",
  inprogress: "In progress",
  sent: "Sent",
  paused: "Paused",
  stopped: "Stopped",
  canceled: "Canceled",
} as const;
export type CampaignStatus = keyof typeof CAMPAIGN_STATUSES;

// Shared by "Copy an existing campaign" and "New campaign", loaded once per tab.
export const campaignsStore = createStore({
  status: "all" as CampaignStatus,
  campaigns: null as Campaign[] | null,
  campaignsLoading: false,
  campaignsError: null as string | null,
});

/** The most recent campaigns in one status, newest first. */
export function fetchCampaigns(status: CampaignStatus): Promise<Campaign[]> {
  const query = new URLSearchParams({ status, range: String(RECENT_CAMPAIGNS) });
  return callApi<Campaign[]>("zoho", `zoho/campaigns?${query}`);
}

/** Loads the shown campaigns for the chosen status filter. */
export async function loadCampaigns() {
  campaignsStore.set({ campaignsLoading: true });
  try {
    campaignsStore.set({ campaigns: await fetchCampaigns(campaignsStore.get().status), campaignsError: null });
  } catch (e) {
    campaignsStore.set({ campaignsError: (e as Error).message });
  } finally {
    campaignsStore.set({ campaignsLoading: false });
  }
}
