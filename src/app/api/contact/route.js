import { NextResponse } from "next/server";
import { createContact } from "@/lib/repos/contact.repo";
import { sendDemoRequestToHubspot } from "@/lib/hubspot";

function isValidEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request) {
  try {
    const body = await request.json();

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const company = String(body?.company || "").trim();
    const message = String(body?.message || "").trim();

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 },
      );
    }

    // Grava na BD do bot e envia para o HubSpot da DIGIK. Basta um dos dois
    // correr bem para o pedido não se perder.
    const [saved, hubspot] = await Promise.allSettled([
      createContact({
        name,
        email,
        company: company || null,
        message,
        source: "landing_page",
        status: "new",
      }),
      sendDemoRequestToHubspot({
        name,
        email,
        company,
        message,
        plan: typeof body?.plan === "string" ? body.plan : null,
        origem: body?.origem && typeof body.origem === "object" ? body.origem : null,
        pageUri: body?.pageUri,
        pageName: body?.pageName,
      }),
    ]);

    const hubspotOk =
      hubspot.status === "fulfilled" && hubspot.value?.status === "ok";

    if (saved.status === "rejected") {
      console.error("[contact-form] erro na BD:", saved.reason);
      if (!hubspotOk) throw saved.reason;
    }

    return NextResponse.json({
      ok: true,
      contactId: saved.status === "fulfilled" ? saved.value.id : null,
    });
  } catch (error) {
    console.error("[contact-form] error:", error);

    return NextResponse.json(
      { error: "Something went wrong while sending the form." },
      { status: 500 },
    );
  }
}
