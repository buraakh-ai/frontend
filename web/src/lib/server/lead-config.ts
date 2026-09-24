import "server-only";
import { readFile } from "node:fs/promises";
import defaults from "@/config/lead-source.json";

// Non-secret Lead source UI config (industries, states, roles, slider limits…).
// Bundled defaults live in src/config/lead-source.json; a partial override can
// come from S3 (STREAMLIT_CONFIG_S3_URI) or a local file (STREAMLIT_CONFIG_FILE).
// The env var names are kept from the Streamlit app so deployments carry over.
// Port of lead_source/config_loader.py: same merge and validation rules, and
// any problem falls back to the defaults with a warning.

export type LeadConfig = typeof defaults;
export type RangeControl = { min: number; max: number; default: number };

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isObject = (v: unknown): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);
const typeName = (v: unknown) => (Array.isArray(v) ? "list" : v === null ? "null" : typeof v);

function validateShape(value: unknown, template: unknown, path = "config"): void {
  if (path === "config.geography.state_areas") {
    const ok =
      isObject(value) &&
      Object.values(value).every((areas) => Array.isArray(areas) && areas.every((a) => typeof a === "string"));
    if (!ok) throw new Error(`${path} must map state names to lists of areas`);
    return;
  }
  if (path === "config.run_controls.provider_labels") {
    if (!isObject(value) || !Object.values(value).every((p) => typeof p === "string")) {
      throw new Error(`${path} must map labels to provider names`);
    }
    return;
  }
  if (isObject(template)) {
    if (!isObject(value)) throw new Error(`${path} must be an object`);
    for (const [key, child] of Object.entries(value)) {
      if (!(key in template)) throw new Error(`unknown configuration key: ${path}.${key}`);
      validateShape(child, template[key], `${path}.${key}`);
    }
  } else if (Array.isArray(template)) {
    if (!Array.isArray(value)) throw new Error(`${path} must be list`);
    if (template.length) value.forEach((child, i) => validateShape(child, template[0], `${path}[${i}]`));
  } else if (typeName(value) !== typeName(template)) {
    throw new Error(`${path} must be ${typeName(template)}`);
  }
}

function merge(base: Record<string, Json>, overrides: Record<string, Json>): Record<string, Json> {
  const result: Record<string, Json> = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = isObject(value) ? merge(result[key] as Record<string, Json>, value) : structuredClone(value);
  }
  return result;
}

function validateSemantics(config: LeadConfig): void {
  const { geography, run_controls: run, campaign } = config;
  if (!geography.countries.includes(geography.default_country)) {
    throw new Error("default_country must be present in countries");
  }
  if (!geography.us_states.includes(geography.default_state)) {
    throw new Error("default_state must be present in us_states");
  }
  if (!campaign.statuses.includes(campaign.default_status)) {
    throw new Error("default_status must be present in statuses");
  }
  if (!run.pipeline_versions.includes(run.default_pipeline_version)) {
    throw new Error("default_pipeline_version must be present in pipeline_versions");
  }
  if (!run.pipeline_versions.includes(run.v2_pipeline_version)) {
    throw new Error("v2_pipeline_version must be present in pipeline_versions");
  }
  if (!run.default_providers.every((p) => p in run.provider_labels)) {
    throw new Error("default_providers must be present in provider_labels");
  }
  const rangeKeys = [
    "source_count_v1", "source_count_v2", "lead_count", "oversampling_factor",
    "max_queries", "results_per_query", "max_pages_per_query", "enrichment_batch_size",
  ] as const;
  for (const key of rangeKeys) {
    const c: RangeControl = run[key];
    if (!(c.min <= c.default && c.default <= c.max)) throw new Error(`${key}.default must be between min and max`);
  }
}

async function readS3(uri: string): Promise<string> {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error("STREAMLIT_CONFIG_S3_URI must use s3://bucket/key format");
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const res = await new S3Client({}).send(new GetObjectCommand({ Bucket: match[1], Key: match[2] }));
  return (await res.Body?.transformToString("utf-8")) ?? "";
}

async function loadLeadConfig(): Promise<{ config: LeadConfig; warning: string | null }> {
  const uri = (process.env.STREAMLIT_CONFIG_S3_URI ?? "").trim();
  const file = (process.env.STREAMLIT_CONFIG_FILE ?? "").trim();
  if (!uri && !file) return { config: defaults, warning: null };

  const source = uri || file;
  try {
    const raw = uri ? await readS3(uri) : await readFile(file, "utf-8");
    const overrides: unknown = JSON.parse(raw);
    if (!isObject(overrides)) throw new Error("configuration root must be a JSON object");
    validateShape(overrides, defaults);
    const merged = merge(defaults as unknown as Record<string, Json>, overrides) as unknown as LeadConfig;
    validateSemantics(merged);
    return { config: merged, warning: null };
  } catch (err) {
    const warning = `Could not load Lead source configuration from ${source}; using defaults (${(err as Error).name}).`;
    console.warn(warning, err);
    return { config: defaults, warning };
  }
}

// Loaded once per server process, like the Streamlit app's st.cache_resource.
let cached: ReturnType<typeof loadLeadConfig> | undefined;
export function getLeadConfig() {
  cached ??= loadLeadConfig();
  return cached;
}
