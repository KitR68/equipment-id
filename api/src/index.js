/*
 * Equipment ID — Azure Functions API entry point.
 *
 * Programming model: Azure Functions Node.js v4 (single-file registration).
 * Storage backend: Azure Table Storage via @azure/data-tables.
 *
 * Required Application Setting (configure in Azure portal):
 *   AZURE_STORAGE_CONNECTION_STRING — full connection string for the
 *   storage account that holds the "ManufacturerKnowledge" table.
 *
 * Routes (auto-prefixed with /api by Static Web Apps):
 *   GET    /api/knowledge                       → list all entries
 *   POST   /api/knowledge                       → create or update an entry
 *   DELETE /api/knowledge?manufacturer=name     → remove an entry
 */
const { app } = require("@azure/functions");
const { knowledgeHandler } = require("./knowledge");

app.http("knowledge", {
  route: "knowledge",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  handler: knowledgeHandler,
});
