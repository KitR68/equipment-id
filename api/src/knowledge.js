/*
 * Equipment ID — knowledge base CRUD handler.
 *
 * Schema for the "ManufacturerKnowledge" Azure Table:
 *   PartitionKey: "manufacturer"            (single partition — small table)
 *   RowKey:       lowercased manufacturer name (URL-safe slug)
 *   name:         original-cased manufacturer name
 *   serialFormat: string
 *   dateDecoding: string
 *   modelFormat:  string | null
 *   sources:      JSON-encoded string[]
 *   updatedAt:    ISO timestamp string
 *   usageCount:   number
 */
const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

const TABLE_NAME = "ManufacturerKnowledge";
const PARTITION_KEY = "manufacturer";

let cachedClient = null;
let cachedClientReady = null;

function parseConnectionString(cs) {
  const out = {};
  for (const part of cs.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

async function getTableClient() {
  if (cachedClient) return cachedClient;
  if (cachedClientReady) return cachedClientReady;

  cachedClientReady = (async () => {
    const cs = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!cs) {
      throw new Error(
        "AZURE_STORAGE_CONNECTION_STRING is not configured. " +
          "Add it as an Application Setting in Azure Static Web Apps configuration.",
      );
    }
    const parsed = parseConnectionString(cs);
    const account = parsed.AccountName;
    const key = parsed.AccountKey;
    const endpointSuffix = parsed.EndpointSuffix || "core.windows.net";
    if (!account || !key) {
      throw new Error("Connection string missing AccountName or AccountKey.");
    }
    const url = `https://${account}.table.${endpointSuffix}`;
    const cred = new AzureNamedKeyCredential(account, key);
    const client = new TableClient(url, TABLE_NAME, cred);
    try {
      await client.createTable();
    } catch (err) {
      // 409 TableAlreadyExists is fine; rethrow anything else
      if (
        err &&
        err.statusCode !== 409 &&
        err.code !== "TableAlreadyExists"
      ) {
        throw err;
      }
    }
    cachedClient = client;
    return client;
  })();

  try {
    return await cachedClientReady;
  } finally {
    cachedClientReady = null;
  }
}

function manufacturerSlug(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 \-_.]/g, "")
    .replace(/\s/g, "-")
    .slice(0, 200);
}

function entityToEntry(entity) {
  let sources = [];
  if (entity.sources) {
    try {
      const parsed = JSON.parse(entity.sources);
      if (Array.isArray(parsed)) sources = parsed;
    } catch {
      sources = [];
    }
  }
  return {
    name: entity.name || entity.rowKey,
    serialFormat: entity.serialFormat || "",
    dateDecoding: entity.dateDecoding || "",
    modelFormat: entity.modelFormat || undefined,
    sources: sources.length ? sources : undefined,
    updatedAt: entity.updatedAt || new Date(0).toISOString(),
    usageCount:
      typeof entity.usageCount === "number" ? entity.usageCount : 0,
  };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(status, body) {
  return {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    jsonBody: body,
  };
}

async function knowledgeHandler(request, context) {
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return { status: 204, headers: CORS_HEADERS };
  }

  let client;
  try {
    client = await getTableClient();
  } catch (err) {
    context.error(`Storage init failed: ${err.message}`);
    return jsonResponse(500, {
      error: "storage_unavailable",
      message: err.message,
    });
  }

  try {
    if (method === "GET") {
      const entries = {};
      const iter = client.listEntities({
        queryOptions: { filter: `PartitionKey eq '${PARTITION_KEY}'` },
      });
      for await (const entity of iter) {
        entries[entity.rowKey] = entityToEntry(entity);
      }
      return jsonResponse(200, { entries });
    }

    if (method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(400, {
          error: "bad_request",
          message: "Invalid JSON body.",
        });
      }
      const name = body && body.name;
      if (!name || typeof name !== "string") {
        return jsonResponse(400, {
          error: "bad_request",
          message: "Field 'name' is required.",
        });
      }
      const slug = manufacturerSlug(name);
      if (!slug) {
        return jsonResponse(400, {
          error: "bad_request",
          message: "Manufacturer name produced an empty slug.",
        });
      }

      // Read existing for usageCount accumulation
      let existing = null;
      try {
        existing = await client.getEntity(PARTITION_KEY, slug);
      } catch (err) {
        if (err && err.statusCode !== 404) throw err;
      }
      const incomingUsage =
        typeof body.usageCount === "number" ? body.usageCount : 1;
      const previousUsage =
        existing && typeof existing.usageCount === "number"
          ? existing.usageCount
          : 0;

      const entity = {
        partitionKey: PARTITION_KEY,
        rowKey: slug,
        name: name.trim(),
        serialFormat: body.serialFormat || "",
        dateDecoding: body.dateDecoding || "",
        modelFormat: body.modelFormat || "",
        sources: JSON.stringify(
          Array.isArray(body.sources) ? body.sources : [],
        ),
        updatedAt: new Date().toISOString(),
        usageCount: previousUsage + Math.max(0, incomingUsage),
      };

      await client.upsertEntity(entity, "Replace");
      return jsonResponse(200, { ok: true, entry: entityToEntry(entity) });
    }

    if (method === "DELETE") {
      const url = new URL(request.url);
      const manufacturer = url.searchParams.get("manufacturer");
      if (!manufacturer) {
        return jsonResponse(400, {
          error: "bad_request",
          message: "Query parameter 'manufacturer' is required.",
        });
      }
      const slug = manufacturerSlug(manufacturer);
      try {
        await client.deleteEntity(PARTITION_KEY, slug);
      } catch (err) {
        if (err && err.statusCode === 404) {
          return jsonResponse(404, {
            error: "not_found",
            message: "No entry for that manufacturer.",
          });
        }
        throw err;
      }
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(405, {
      error: "method_not_allowed",
      message: `Method ${method} not allowed.`,
    });
  } catch (err) {
    context.error(`Knowledge handler error: ${err.stack || err.message}`);
    return jsonResponse(500, {
      error: "internal_error",
      message: err.message || "Unexpected error.",
    });
  }
}

module.exports = { knowledgeHandler };
