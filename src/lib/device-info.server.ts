/**
 * Builds the public device-information snapshot:
 * device details, fitted toner cartridges, parts (with life/consumption) and
 * every billing counter value, published to GitHub as
 * data/device_information.csv + data/device_information.json.
 */
import { canonLogin, DISTRIBUTOR_TENANT_ID, type CanonDevice } from "./canon.server";
import { publishFile } from "./github.server";

export const DEVICE_INFO_CSV_PATH = "data/device_information.csv";
export const DEVICE_INFO_JSON_PATH = "data/device_information.json";
export const DEVICE_INFO_RAW_URL =
  "https://raw.githubusercontent.com/cipolokwane/copier-data-fetcher/main/data/device_information.csv";

const DEVICE_SCOPE = "RcmDeviceRead owner.noRightRequirements";
const PARTS_SCOPE = "RcmPartRead owner.noRightRequirements";

type DeviceDetail = {
  deviceName?: string | null;
  deviceType?: number | string | null;
  service?: string | null;
  merchandiseName?: string | null;
  contractNo?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  installDate?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  addressRegionCode?: string | null;
  embeddedRds?: boolean;
  isActive?: boolean;
  tonerMonitoringAlarm?: string | null;
  installationLocation?: Record<string, string> | null;
  printingConsumable?: { types?: { colorAttribute?: string; printingConsumableName?: string }[] } | null;
  serviceOption?: Record<string, boolean> | null;
};

type PartRow = {
  subItemName?: string | null;
  partNumber?: string | null;
  partNames?: { partName?: string; language?: string }[];
  currentCounter?: number | null;
  partLifetime?: number | null;
  consumptionRate?: string | number | null;
  previousReplacement?: string | null;
};

export type DeviceInfoRow = {
  serial_number: string;
  device_unique_id: string;
  device_name: string;
  device_model: string;
  customer_name: string;
  customer_id: string;
  status: string;
  colour: boolean;
  rds_version: string;
  ip_address: string;
  mac_address: string;
  location: string;
  install_date: string;
  contract_no: string;
  contract_start: string;
  contract_end: string;
  last_communication: string;
  toner_cartridges: { colour: string; name: string }[];
  toner_alarm: string;
  parts: {
    part_number: string;
    part_name: string;
    sub_item: string;
    current_counter: number | null;
    part_lifetime: number | null;
    life_used_percent: number | null;
    previous_replacement: string;
  }[];
  billing_counters: Record<string, number>;
  total_counter: number | null;
  mono_counter: number | null;
  colour_counter: number | null;
};

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const csvField = (value: unknown) =>
  str(value).replace(/[",\r\n]+/g, " ").replace(/\s+/g, " ").trim();

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      out[current] = await fn(items[current]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function buildDeviceInfoRows(devices: CanonDevice[]): Promise<DeviceInfoRow[]> {
  const session = await canonLogin();
  const query = { distributorTenantId: DISTRIBUTOR_TENANT_ID };

  return mapWithLimit(devices, 6, async (device) => {
    let detail: DeviceDetail = {};
    let parts: PartRow[] = [];
    try {
      detail = await session.api<DeviceDetail>(`/v1/devices/${device.deviceUniqueId}`, DEVICE_SCOPE, query);
    } catch (error) {
      console.error(`Device detail failed for ${device.serialNo}:`, error);
    }
    try {
      const res = await session.api<{ resources?: PartRow[] }>(
        `/v1/parts/${device.deviceUniqueId}/latest`,
        PARTS_SCOPE,
        { ...query, perPage: "100", page: "1" },
      );
      parts = res.resources ?? [];
    } catch (error) {
      console.error(`Parts failed for ${device.serialNo}:`, error);
    }

    const loc = detail.installationLocation ?? {};
    const location = [loc["location"], loc["building"], loc["address1"], loc["address2"]]
      .filter(Boolean)
      .join(" ");

    return {
      serial_number: str(device.serialNo),
      device_unique_id: str(device.deviceUniqueId),
      device_name: str(detail.deviceName),
      device_model: str(detail.merchandiseName ?? device.model),
      customer_name: str(device.customerName),
      customer_id: str(device.customerId),
      status: detail.isActive === false ? "inactive" : "active",
      colour: device.color,
      rds_version: str(device.rdsVersion),
      ip_address: str(detail.ipAddress),
      mac_address: str(detail.macAddress),
      location,
      install_date: str(detail.installDate ?? device.installDate),
      contract_no: str(detail.contractNo),
      contract_start: str(detail.contractStartDate),
      contract_end: str(detail.contractEndDate),
      last_communication: str(device.lastReceived),
      toner_cartridges: (detail.printingConsumable?.types ?? []).map((t) => ({
        colour: str(t.colorAttribute),
        name: str(t.printingConsumableName),
      })),
      toner_alarm: str(detail.tonerMonitoringAlarm),
      parts: parts.map((p) => {
        const counter = Number.isFinite(Number(p.currentCounter)) ? Number(p.currentCounter) : null;
        const life = Number.isFinite(Number(p.partLifetime)) ? Number(p.partLifetime) : null;
        const rate = Number(p.consumptionRate);
        return {
          part_number: str(p.partNumber),
          part_name: str(p.partNames?.find((n) => n.language === "EN")?.partName ?? p.partNames?.[0]?.partName),
          sub_item: str(p.subItemName),
          current_counter: counter,
          part_lifetime: life,
          life_used_percent: Number.isFinite(rate)
            ? Math.round(rate * 100) / 100
            : life && counter
              ? Math.round((counter / life) * 10000) / 100
              : null,
          previous_replacement: str(p.previousReplacement),
        };
      }),
      billing_counters: device.meters ?? {},
      total_counter: device.totalCounter,
      mono_counter: device.bwCounter,
      colour_counter: device.colorCounter,
    };
  });
}

const HEADER = [
  "serial_number",
  "device_model",
  "device_name",
  "customer_name",
  "customer_id",
  "status",
  "colour",
  "rds_version",
  "ip_address",
  "mac_address",
  "location",
  "install_date",
  "contract_no",
  "contract_start",
  "contract_end",
  "last_communication",
  "toner_cartridges",
  "toner_alarm",
  "total_counter",
  "mono_counter",
  "colour_counter",
  "billing_counters",
  "parts",
];

export function buildDeviceInfoCsv(rows: DeviceInfoRow[]): string {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.serial_number),
        csvField(r.device_model),
        csvField(r.device_name),
        csvField(r.customer_name),
        csvField(r.customer_id),
        csvField(r.status),
        r.colour ? "colour" : "mono",
        csvField(r.rds_version),
        csvField(r.ip_address),
        csvField(r.mac_address),
        csvField(r.location),
        csvField(r.install_date),
        csvField(r.contract_no),
        csvField(r.contract_start),
        csvField(r.contract_end),
        csvField(r.last_communication),
        csvField(r.toner_cartridges.map((t) => `${t.colour}:${t.name}`).join(" | ")),
        csvField(r.toner_alarm),
        r.total_counter ?? "",
        r.mono_counter ?? "",
        r.colour_counter ?? "",
        csvField(
          Object.entries(r.billing_counters)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([id, value]) => `${id}=${value}`)
            .join(" "),
        ),
        csvField(
          r.parts
            .map(
              (p) =>
                `${p.part_number} ${p.part_name} ${p.current_counter ?? ""}/${p.part_lifetime ?? ""} ${
                  p.life_used_percent ?? ""
                }%`,
            )
            .join(" | "),
        ),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export async function publishDeviceInfoSnapshot(
  devices: CanonDevice[],
  fetchedAt: string,
): Promise<{ ok: boolean; url?: string; rows?: number; error?: string }> {
  try {
    if (!devices.length) return { ok: false, error: "No devices in fetch — snapshot left unchanged." };
    const rows = await buildDeviceInfoRows(devices);
    if (!rows.length) return { ok: false, error: "No device rows — snapshot left unchanged." };

    const message = `auto: device information ${fetchedAt.slice(0, 16)}Z (${rows.length} devices)`;
    const url = await publishFile(DEVICE_INFO_CSV_PATH, buildDeviceInfoCsv(rows), message);
    try {
      await publishFile(
        DEVICE_INFO_JSON_PATH,
        JSON.stringify({ generated_at: fetchedAt, count: rows.length, devices: rows }, null, 2) + "\n",
        message,
      );
    } catch (error) {
      console.error("device_information.json publish failed:", error);
    }
    return { ok: true, url, rows: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Device information publish failed:", message);
    return { ok: false, error: message };
  }
}
