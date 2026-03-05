import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LeadStatus, EventType } from "@inmoflow/db";
import { EventLogService } from "../event-log/event-log.service";

interface ImportRow {
  name?: string;
  phone?: string;
  email?: string;
  status?: string;
  notes?: string;
  intent?: string;
  stageKey?: string;
  [key: string]: string | undefined;
}

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
  ) {}

  /**
   * Parse CSV text into rows.
   * Handles: comma/semicolon delimiter, quoted fields, newline inside quotes.
   */
  parseCSV(text: string): ImportRow[] {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new BadRequestException("CSV must have a header row and at least one data row");

    // Detect delimiter
    const delimiter = lines[0].includes(";") ? ";" : ",";
    const headers = this.parseLine(lines[0], delimiter).map((h) =>
      h.trim().toLowerCase().replace(/\s+/g, "_"),
    );

    const rows: ImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i], delimiter);
      if (values.every((v) => !v.trim())) continue; // Skip empty rows
      const row: ImportRow = {};
      headers.forEach((h, idx) => {
        if (values[idx]?.trim()) row[h] = values[idx].trim();
      });
      rows.push(row);
    }
    return rows;
  }

  private parseLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  /**
   * Preview: returns parsed rows + detected columns
   */
  preview(text: string): { columns: string[]; rows: ImportRow[]; count: number } {
    const rows = this.parseCSV(text);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { columns, rows: rows.slice(0, 10), count: rows.length };
  }

  /**
   * Execute import of leads
   */
  async importLeads(
    tenantId: string,
    text: string,
    mapping?: Record<string, string>, // csv_column -> lead_field
    sourceId?: string,
  ): Promise<ImportResult> {
    const allRows = this.parseCSV(text);
    if (allRows.length === 0) throw new BadRequestException("No data rows found");
    if (allRows.length > 5000) throw new BadRequestException("Maximum 5000 rows per import");

    // Resolve default stage
    const defaultStage = await this.prisma.leadStage.findFirst({
      where: { tenantId, isDefault: true },
    });

    // Build mapped rows
    const result: ImportResult = { total: allRows.length, created: 0, skipped: 0, errors: [] };

    // Batch in chunks of 100
    for (let i = 0; i < allRows.length; i += 100) {
      const chunk = allRows.slice(i, i + 100);
      const createData = [];

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const rowNum = i + j + 2; // +2 for header + 1-indexed

        try {
          // Apply mapping if present
          const mapped: ImportRow = {};
          if (mapping) {
            for (const [csvCol, leadField] of Object.entries(mapping)) {
              if (row[csvCol] !== undefined) mapped[leadField] = row[csvCol];
            }
          } else {
            // Auto-map known fields
            Object.assign(mapped, row);
          }

          const name = mapped.name || mapped.nombre || mapped.full_name;
          const phone = mapped.phone || mapped.telefono || mapped.tel || mapped.celular || mapped.mobile;
          const email = mapped.email || mapped.correo || mapped.mail;

          if (!name && !phone && !email) {
            result.errors.push({ row: rowNum, error: "No name, phone, or email found" });
            result.skipped++;
            continue;
          }

          let status: LeadStatus = LeadStatus.NEW;
          const rawStatus = (mapped.status || mapped.estado || "").toUpperCase();
          if (rawStatus && Object.values(LeadStatus).includes(rawStatus as LeadStatus)) {
            status = rawStatus as LeadStatus;
          }

          // Resolve stage
          let stageId = defaultStage?.id;
          if (mapped.stageKey || mapped.stage_key || mapped.etapa) {
            const key = (mapped.stageKey || mapped.stage_key || mapped.etapa)!;
            const stage = await this.prisma.leadStage.findUnique({
              where: { tenantId_key: { tenantId, key: key.toLowerCase() } },
            });
            if (stage) stageId = stage.id;
          }

          createData.push({
            tenantId,
            name: name || null,
            phone: phone || null,
            email: email || null,
            status,
            stageId,
            sourceId: sourceId || undefined,
            intent: mapped.intent || mapped.interes || null,
            notes: mapped.notes || mapped.notas || mapped.observaciones || null,
          });
        } catch (err: any) {
          result.errors.push({ row: rowNum, error: err.message || "Unknown error" });
          result.skipped++;
        }
      }

      if (createData.length > 0) {
        const created = await this.prisma.lead.createMany({ data: createData as any });
        result.created += created.count;
      }
    }

    // Log event
    await this.eventLog.log({
      tenantId,
      type: EventType.lead_created,
      entity: "import",
      message: `Imported ${result.created} leads (${result.skipped} skipped, ${result.errors.length} errors)`,
      payload: { total: result.total, created: result.created, skipped: result.skipped },
    });

    return result;
  }
}
