/**
 * Canon eMaintenance (CAMS / RCM) API client.
 * Logs in with the stored portal credentials, exchanges the session for
 * scoped Bearer tokens and reads device + meter data.
 */

const IDENTITY = "https://www-ec1.srv.ygles.com";
const RCM = "https://rcm-ec1.srv.ygles.com";

const COUNTER_IDS = [
  "112", "113", "122", "123", "181", "182", "183", "184",
  "501", "064", "071", "072", "073", "074",
];

export type CanonDevice = {
  serialNo: string;
  model: string;
  customerName: string;
  customerId: string;
  distributorName: string;
  deviceUniqueId: string;
  rdsVersion: string | null;
  statusCode: string | null;
  color: boolean;
  installDate: string | null;
  lastReceived: string | null;
  totalCounter: number | null;
  bwCounter: number | null;
  colorCounter: number | null;
  copyBw: number | null;
  copyColor: number | null;
  meters: Record<string, number>;
};

type Paged<T> = {
  page: number;
  totalPages: number;
  totalCount: number;
  resources: T[];
};

class CanonSession {
  private cookie = "";

  private mergeCookies(res: Response) {
    const raw = res.headers.getSetCookie?.() ?? [];
    if (!raw.length) return;
    const jar = new Map<string, string>();
    for (const part of this.cookie.split("; ").filter(Boolean)) {
      const i = part.indexOf("=");
      jar.set(part.slice(0, i), part.slice(i + 1));
    }
    for (const c of raw) {
      const pair = c.split(";")[0]!;
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
    }
    this.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private async request(url: string, init: RequestInit = {}) {
    const res = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0",
        ...(init.headers as Record<string, string> | undefined),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
    });
    this.mergeCookies(res);
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      return this.request(new URL(location, url).toString(), { headers: init.headers });
    }
    return res;
  }

  async login(username: string, password: string) {
    const res = await this.request(`${IDENTITY}/ccb/api/identity/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: username, password }),
    });
    if (!res.ok) {
      throw new Error(`Canon login failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { redirect_uri?: string };
    if (data.redirect_uri) await this.request(data.redirect_uri);
  }

  async token(scope: string) {
    const res = await this.request(`${IDENTITY}/cam/api/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ scope }).toString(),
    });
    if (!res.ok) {
      throw new Error(`Canon token failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
    }
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async api<T>(
    path: string,
    scope: string,
    query: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    const token = await this.token(scope);
    const url = `${RCM}${path}?${new URLSearchParams(query).toString()}`;
    const res = await this.request(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Canon API ${path} failed [${res.status}]: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }
}

async function fetchAllPages<T>(
  load: (page: number) => Promise<Paged<T>>,
): Promise<{ rows: T[]; meta: Paged<T> }> {
  const first = await load(1);
  const rows = [...first.resources];
  for (let page = 2; page <= first.totalPages; page++) {
    const next = await load(page);
    rows.push(...next.resources);
  }
  return { rows, meta: first };
}

type DeviceRow = {
  deviceSerialNo: string;
  deviceUniqueId: string;
  merchandiseName: string | null;
  customerName: string | null;
  customerId: string | null;
  distributorName: string | null;
  rdsVersion: string | null;
  statusCode: string | null;
  colorPPM: number;
};

type MeterRow = {
  deviceUniqueId: string;
  installDate: string | null;
  receiveLocalDateTime: string | null;
  meterReadings: { counterId: string; value: number }[];
};

export async function fetchCanonDevices(): Promise<{
  devices: CanonDevice[];
  distributorName: string | null;
  fetchedAt: string;
}> {
  const username = process.env["CANON_USERNAME"];
  const password = process.env["CANON_PASSWORD"];
  if (!username || !password) throw new Error("Canon portal credentials are not configured.");

  const session = new CanonSession();
  await session.login(username, password);

  const distributorTenantId = "611CC";
  const baseQuery = {
    filterBy: "distributorTenantId",
    filterValue: distributorTenantId,
    filterSubValue: "",
    distributorTenantId,
    perPage: "100",
  };

  const deviceResult = await fetchAllPages<DeviceRow>((page) =>
    session.api<Paged<DeviceRow>>(
      "/v1/views/navigations/device-list",
      "RcmViewDeviceRead owner.noRightRequirements",
      { ...baseQuery, page: String(page) },
    ),
  );

  let meterRows: MeterRow[] = [];
  try {
    const meterResult = await fetchAllPages<MeterRow>((page) =>
      session.api<Paged<MeterRow>>(
        "/v1/meter-readings/billing-meter",
        "RcmMeterBillingRead owner.noRightRequirements",
        { ...baseQuery, page: String(page), isAsync: "true" },
        { searchOptions: COUNTER_IDS.map((counterId) => ({ counterId })) },
      ),
    );
    meterRows = meterResult.rows;
  } catch (error) {
    console.error("Canon meter readings unavailable:", error);
  }

  const meterByDevice = new Map(meterRows.map((row) => [row.deviceUniqueId, row]));

  const devices: CanonDevice[] = deviceResult.rows.map((row) => {
    const meter = meterByDevice.get(row.deviceUniqueId);
    const meters: Record<string, number> = {};
    for (const reading of meter?.meterReadings ?? []) meters[reading.counterId] = reading.value;
    const pick = (id: string) => (id in meters ? meters[id]! : null);
    return {
      serialNo: row.deviceSerialNo,
      model: row.merchandiseName ?? "—",
      customerName: row.customerName ?? "—",
      customerId: row.customerId ?? "—",
      distributorName: row.distributorName ?? "—",
      deviceUniqueId: row.deviceUniqueId,
      rdsVersion: row.rdsVersion ?? null,
      statusCode: row.statusCode ?? null,
      color: row.colorPPM > 0,
      installDate: meter?.installDate ?? null,
      lastReceived: meter?.receiveLocalDateTime || null,
      totalCounter: pick("501"),
      bwCounter: pick("113"),
      colorCounter: pick("112"),
      copyBw: pick("123"),
      copyColor: pick("122"),
      meters,
    };
  });

  devices.sort((a, b) => a.customerName.localeCompare(b.customerName));

  return {
    devices,
    distributorName: deviceResult.rows[0]?.distributorName ?? null,
    fetchedAt: new Date().toISOString(),
  };
}
