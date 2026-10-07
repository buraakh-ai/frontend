import {
  CloudUpload,
  Database,
  Download,
  ScanSearch,
  Video,
  Volume1,
  type LucideIcon,
} from "lucide-react";

export type ModuleGroup = "create" | "source" | "leads" | "activate";

export type Module = {
  label: string;
  description: string;
  icon: LucideIcon;
  group: ModuleGroup;
  /** Omitted while the module is not built yet; it then shows as "Soon". */
  href?: string;
};

export const GROUPS: Record<ModuleGroup, { section: string; badge: string }> = {
  create: { section: "Create", badge: "Create" },
  source: { section: "Lead sources", badge: "Source" },
  leads: { section: "Leads", badge: "Leads" },
  activate: { section: "Activate", badge: "Activate" },
};

// Single list for the sidebar and the Growth Hub grid, in display order.
export const MODULES: Module[] = [
  {
    label: "Ad Studio",
    description: "Event-tied ad copy and images, ready to publish.",
    icon: Volume1,
    group: "create",
    href: "/ad-generator",
  },
  {
    label: "Lead Finder",
    description: "Find prospects on the web; every run lands in the Lead Hub.",
    icon: ScanSearch,
    group: "source",
    href: "/lead-source",
  },
  {
    label: "Bitrix24 Export",
    description: "Get leads from a Bitrix24 CRM form and import them to the Lead Hub.",
    icon: Download,
    group: "source",
    href: "/bitrix-export",
  },
  {
    label: "Zoom Webinar Import",
    description: "Pull registrants from selected Zoom webinars.",
    icon: Video,
    group: "source",
  },
  {
    label: "Lead Hub",
    description: "Review leads from every source and sync the ones you choose to Zoho.",
    icon: Database,
    group: "leads",
    href: "/lead-hub",
  },
  {
    label: "Zoho Campaigns Sync",
    description: "Export leads to Zoho CRM and a Zoho Campaigns list.",
    icon: CloudUpload,
    group: "activate",
  },
];
