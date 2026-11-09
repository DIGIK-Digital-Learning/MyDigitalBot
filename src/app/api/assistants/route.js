import { withSessionReadAccess } from "@/lib/db/readAccess";
import { NextResponse } from "next/server";

import {
  countAssistantsByOrg,
  createAssistant,
  getAssistantsInOrg,
} from "@/lib/repos/assistants.repo";
import {
  getOrgLimits,
  hasRoomFor,
  limitKeepingCurrent,
  limitReachedBody,
  planExpiredBody,
} from "@/lib/services/plans/planLimits";

import { recordAuditEvent } from "@/lib/services/audit/recordAuditEvent";
import { AUDIT_ACTIONS } from "@/lib/audit/auditEvents";
import { assistantTextTooLong } from "@/lib/assistants/assistantTextLimits";

import {
  handleApiError,
  requireOwnedOrg,
  parsePositiveInt,
} from "@/lib/auth/guards";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const orgId = parsePositiveInt(searchParams.get("orgId"));

    if (!orgId) {
      return NextResponse.json(
        {
          error: "Invalid organization id",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Ensure the logged-in user owns
     * this organization.
     */
    const orgAuth = await requireOwnedOrg(orgId);

    if (orgAuth.error) {
      return orgAuth.error;
    }

    return await withSessionReadAccess(orgAuth, async () => {
      const assistants = await getAssistantsInOrg(orgAuth.orgId);

      return NextResponse.json(assistants, {
        status: 200,
      });
    });
  } catch (err) {
    return handleApiError(err, "Failed to load assistants");
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    const orgId = parsePositiveInt(body?.organizationId);

    if (!orgId) {
      return NextResponse.json(
        {
          error: "Invalid organization id",
        },
        {
          status: 400,
        },
      );
    }

    const orgAuth = await requireOwnedOrg(orgId);

    if (orgAuth.error) {
      return orgAuth.error;
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";

    const model = typeof body?.model === "string" ? body.model.trim() : "";

    if (!name) {
      return NextResponse.json(
        {
          error: "Assistant name is required",
        },
        {
          status: 400,
        },
      );
    }

    if (!model) {
      return NextResponse.json(
        {
          error: "Assistant model is required",
        },
        {
          status: 400,
        },
      );
    }

    /* Título até 80 caracteres e descrição até 200. */
    const textTooLong = assistantTextTooLong({
      name,
      description: body?.description,
    });

    if (textTooLong) {
      return NextResponse.json(
        { error: "Assistant text is too long", ...textTooLong },
        { status: 400 },
      );
    }

    /* Limite de assistentes do plano (Demo = 1). */
    const orgLimits = await getOrgLimits(orgAuth.orgId);

    /* A Demo terminou (#209): ver continua, criar e enviar não. */
    const expired = planExpiredBody(orgLimits);
    if (expired) return NextResponse.json(expired, { status: 403 });

    const assistantCount = await countAssistantsByOrg(orgAuth.orgId);

    if (!hasRoomFor(orgLimits.limits.assistants, assistantCount)) {
      return NextResponse.json(
        limitReachedBody("ASSISTANT_LIMIT_REACHED", "assistants", orgLimits),
        { status: 409 },
      );
    }

    /* Tamanho das instruções (#185): um assistente novo tem o limite do plano. */
    const instructionsLimit = limitKeepingCurrent(
      orgLimits.limits.assistantInstructionChars,
    );

    if (
      instructionsLimit !== null &&
      String(body.instructions ?? "").length > instructionsLimit
    ) {
      return NextResponse.json(
        {
          ...limitReachedBody(
            "INSTRUCTIONS_TOO_LONG",
            "assistantInstructionChars",
            orgLimits,
          ),
          limit: instructionsLimit,
        },
        { status: 400 },
      );
    }

    /*
     * =========================================================
     * DB-ONLY ASSISTANT
     * =========================================================
     *
     * No OpenAI Assistant object is created.
     *
     * This Supabase row is now the Assistant
     * configuration used by the Responses API.
     */
    const assistant = await createAssistant({
      organizationId: orgAuth.orgId,

      name,

      description: body.description ?? null,

      instructions: body.instructions ?? null,

      model,

      top_p: body.top_p ?? null,

      temperature: body.temperature ?? null,
    });

    await recordAuditEvent(orgAuth, {
      action: AUDIT_ACTIONS.ASSISTANT_CREATED,
      entityId: assistant?.id,
      entityLabel: assistant?.name ?? name,
      details: { model },
    });

    return NextResponse.json(assistant, {
      status: 201,
    });
  } catch (err) {
    return handleApiError(err, "Failed to create assistant");
  }
}
